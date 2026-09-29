"use client";

import * as React from "react";
import type { SupportFeedbackSignal } from "@/inngest/client";
import {
  aggregateVariantResults,
  simulatedVariantResults,
  type ExperimentAggregate,
  type VariantResult,
} from "@/lib/experiment-results";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { wait } from "./useAgentRun";

// Mirror supportCsat in support-score-run.ts. Not imported: that
// module pulls the server-side Inngest client into the browser bundle.
const FEEDBACK_STEP = "attach-human-feedback-score";
const SCORER_FUNCTION = "support-agent-csat";

export type Feedback = {
  signal: SupportFeedbackSignal;
  /** "pending" until the scorer's durable step is observed. */
  receipt: "pending" | "recorded" | "sent" | "offline";
};

/**
 * The visitor's vote on the reply. Optimistic on screen; the receipt flips to
 * "recorded" once the scorer run's durable step is actually observed.
 */
export function useFeedback() {
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const generation = React.useRef(0);

  const reset = React.useCallback(() => {
    generation.current += 1;
    setFeedback(null);
  }, []);

  const vote = React.useCallback(
    async (
      signal: SupportFeedbackSignal,
      target: { supportRunId: string | null; runId: string | null },
    ) => {
      const gen = ++generation.current;
      const isCurrent = () => generation.current === gen;

      setFeedback({ signal, receipt: "pending" });

      if (!target.supportRunId) {
        setFeedback({ signal, receipt: "offline" });
        return;
      }

      const sent = await fetch("/api/support/signal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supportRunId: target.supportRunId,
          parentRunId: target.runId ?? undefined,
          signal,
        }),
      })
        .then((response) => response.json() as Promise<{ sent: boolean }>)
        .then((body) => body.sent)
        .catch(() => false);

      if (!isCurrent()) return;

      if (!sent) {
        setFeedback({ signal, receipt: "offline" });
        return;
      }

      for (let attempt = 0; attempt < 12 && isCurrent(); attempt += 1) {
        await wait(600);

        if (await scorerStepObserved(target.supportRunId)) {
          if (isCurrent()) setFeedback({ signal, receipt: "recorded" });
          return;
        }
      }

      // Inngest accepted the event but the scorer step was not observed in
      // time (e.g. a cloud run landing slowly). Say what is known, no more.
      if (isCurrent()) setFeedback({ signal, receipt: "sent" });
    },
    [],
  );

  return { feedback, vote, reset };
}

async function scorerStepObserved(supportRunId: string): Promise<boolean> {
  const params = new URLSearchParams({
    supportRunId,
    functionName: SCORER_FUNCTION,
    stepName: FEEDBACK_STEP,
  });

  try {
    const response = await fetch(`/api/support/status?${params}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as {
      timeline: { steps: Array<{ displayName: string; status: string }> } | null;
    };

    return Boolean(
      body.timeline?.steps.some(
        (step) => step.displayName === FEEDBACK_STEP && step.status === "completed",
      ),
    );
  } catch {
    return false;
  }
}

/** Eight runs keeps both variants present ~99% of the time at 50/50. */
export const SPLIT_TEST_RUNS = 8;
const POLL_MS = 600;
/** Nothing captured this long after sending: the batch is not coming. */
const ACK_TIMEOUT_MS = 5_000;
/** The whole split test must land inside this budget, or fall back. */
const SPLIT_BUDGET_MS = 15_000;
/** Pacing for revealing finished runs, so the lanes visibly fill. */
const REVEAL_MS = 420;

export type SplitTest = {
  status: "idle" | "running" | "complete";
  /** Runs revealed on screen so far, in finish order. */
  results: VariantResult[];
  aggregate: ExperimentAggregate;
  simulated: boolean;
  experimentUrl: string;
};

const emptySplit: SplitTest = {
  status: "idle",
  results: [],
  aggregate: aggregateVariantResults([], SPLIT_TEST_RUNS),
  simulated: false,
  experimentUrl: getDeepLink("experiment"),
};

/**
 * The model split test: fans out real group.experiment runs, then reveals the
 * captured results one at a time so the race is watchable. Falls back to the
 * labelled simulation if the batch does not arrive within budget.
 */
export function useSplitTest() {
  const [split, setSplit] = React.useState<SplitTest>(emptySplit);
  const generation = React.useRef(0);

  const reset = React.useCallback(() => {
    generation.current += 1;
    setSplit(emptySplit);
  }, []);

  const start = React.useCallback(async () => {
    const gen = ++generation.current;
    const isCurrent = () => generation.current === gen;
    const startedAt = Date.now();

    setSplit({ ...emptySplit, status: "running" });

    const trigger = await fetch("/api/support/experiment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: SPLIT_TEST_RUNS }),
    })
      .then(
        (response) =>
          response.json() as Promise<{
            sent: boolean;
            batchId: string;
            experimentUrl?: string;
          }>,
      )
      .catch(() => null);

    if (!isCurrent()) return;

    if (trigger?.experimentUrl) {
      const experimentUrl = trigger.experimentUrl;
      setSplit((current) => ({ ...current, experimentUrl }));
    }

    let source: VariantResult[] = [];
    let simulated = !trigger?.sent;
    let revealed = 0;
    let lastRevealAt = 0;
    let lastPollAt = 0;

    if (simulated) source = simulatedVariantResults(SPLIT_TEST_RUNS);

    while (isCurrent()) {
      const now = Date.now();

      if (!simulated && trigger && now - lastPollAt >= POLL_MS) {
        lastPollAt = now;
        const status = await fetchSplitStatus(trigger.batchId);
        if (!isCurrent()) return;

        if (status) source = status.results;

        const elapsed = Date.now() - startedAt;
        const stalled =
          (status?.captured ?? 0) === 0 && elapsed > ACK_TIMEOUT_MS;
        const overBudget =
          source.length < SPLIT_TEST_RUNS && elapsed > SPLIT_BUDGET_MS;

        if (stalled || overBudget) {
          // Switch wholesale rather than mixing live and simulated rows: a
          // chart that is half real is harder to explain than a labelled one.
          simulated = true;
          source = simulatedVariantResults(SPLIT_TEST_RUNS);
          revealed = 0;
        }
      }

      if (revealed < source.length && Date.now() - lastRevealAt >= REVEAL_MS) {
        revealed += 1;
        lastRevealAt = Date.now();
        const shown = source.slice(0, revealed);

        setSplit((current) => ({
          ...current,
          status: revealed >= SPLIT_TEST_RUNS ? "complete" : "running",
          results: shown,
          aggregate: aggregateVariantResults(shown, SPLIT_TEST_RUNS),
          simulated,
        }));

        if (revealed >= SPLIT_TEST_RUNS) return;
      }

      await wait(100);
    }
  }, []);

  return { split, start, reset };
}

async function fetchSplitStatus(
  batchId: string,
): Promise<{ captured: number; results: VariantResult[] } | null> {
  try {
    const response = await fetch(
      `/api/support/experiment/status?batchId=${encodeURIComponent(batchId)}&count=${SPLIT_TEST_RUNS}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    return (await response.json()) as {
      captured: number;
      results: VariantResult[];
    };
  } catch {
    return null;
  }
}
