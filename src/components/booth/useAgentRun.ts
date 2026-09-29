"use client";

import * as React from "react";
import {
  currentSupportModel,
  type SupportTicketId,
  type SupportTurn,
} from "@/content/support-demo";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";
import { buildReplayTimeline } from "@/lib/replay-timeline";
import { getDeepLink } from "@/lib/inngest-dashboard";

/**
 * One support run, start to finish, with a guaranteed fast path.
 *
 * The live path triggers the real Inngest function and polls the captured
 * timeline. The watchdog switches to the labelled replay when the live run is
 * not going to make the booth's time budget:
 *
 *   - the trigger failed or Inngest did not accept the event: replay now;
 *   - nothing captured within ACK_TIMEOUT_MS: replay;
 *   - no progress for STALL_TIMEOUT_MS on a live run: replay.
 *
 * A replay is never presented as live: `simulated` travels with it and the
 * screen shows a Replay tag.
 */

const POLL_MS = 600;
const REPLAY_TICK_MS = 150;
const ACK_TIMEOUT_MS = 5_000;
const STALL_TIMEOUT_MS = 25_000;

export type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "retrying"
  | "complete"
  | "failed";

export type AgentRun = {
  phase: RunPhase;
  ticketId: SupportTicketId | null;
  /** 2 when this run answers the customer's follow-up. */
  turn: SupportTurn;
  supportRunId: string | null;
  /** Inngest run id once known: the key for step.score and the trace link. */
  runId: string | null;
  timeline: RunTimeline | null;
  simulated: boolean;
  replayReason: string | null;
  model: string;
  traceUrl: string;
  error: string | null;
};

const initialRun: AgentRun = {
  phase: "idle",
  ticketId: null,
  turn: 1,
  supportRunId: null,
  runId: null,
  timeline: null,
  simulated: false,
  replayReason: null,
  model: currentSupportModel,
  traceUrl: getDeepLink("runTrace"),
  error: null,
};

type TriggerResponse = {
  sent: boolean;
  supportRunId: string;
  inngestEventId?: string;
  error?: string;
};

type StatusResponse = {
  status: "pending" | "running" | "completed" | "failed";
  runId?: string;
  traceUrl?: string;
  timeline: RunTimeline | null;
};

export function useAgentRun() {
  const [run, setRun] = React.useState<AgentRun>(initialRun);
  // Bumped on every start and reset. Async loops compare against it and stop
  // as soon as they belong to a run that is no longer on screen.
  const generation = React.useRef(0);

  const reset = React.useCallback(() => {
    generation.current += 1;
    setRun(initialRun);
  }, []);

  React.useEffect(() => () => {
    generation.current += 1;
  }, []);

  const start = React.useCallback(
    async (
      ticketId: SupportTicketId,
      failureArmed: boolean,
      followUp?: { followUpOf: string | null },
    ) => {
      const gen = ++generation.current;
      const isCurrent = () => generation.current === gen;
      const turn: SupportTurn = followUp ? 2 : 1;
      // A follow-up answers the customer, not the outage: never armed.
      const armed = turn === 1 && failureArmed;

      setRun({ ...initialRun, phase: "starting", ticketId, turn });

      const replay = (reason: string, supportRunId: string) => {
        if (!isCurrent()) return;
        void runReplay({
          ticketId,
          turn,
          failureArmed: armed,
          supportRunId,
          reason,
          isCurrent,
          setRun,
        });
      };

      let trigger: TriggerResponse;

      try {
        const response = await fetch("/api/support/trigger", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ticketId,
            model: currentSupportModel,
            failureStep: armed ? undefined : "none",
            ...(followUp
              ? { turn: 2, followUpOf: followUp.followUpOf ?? undefined }
              : {}),
          }),
        });
        trigger = (await response.json()) as TriggerResponse;
      } catch {
        replay("App server unreachable", crypto.randomUUID());
        return;
      }

      if (!isCurrent()) return;

      setRun((current) => ({ ...current, supportRunId: trigger.supportRunId }));

      if (!trigger.sent) {
        replay("Inngest unreachable", trigger.supportRunId);
        return;
      }

      const triggeredAt = Date.now();
      let lastProgressAt = triggeredAt;
      let lastSignature = "";

      while (isCurrent()) {
        await wait(POLL_MS);
        if (!isCurrent()) return;

        const status = await fetchStatus(trigger).catch(() => null);
        const timeline = status?.timeline ?? null;
        const now = Date.now();

        if (!timeline || timeline.steps.length === 0) {
          if (now - triggeredAt > ACK_TIMEOUT_MS) {
            replay("Live run did not start in time", trigger.supportRunId);
            return;
          }
          continue;
        }

        const signature = timeline.steps
          .map((step) => `${step.displayName}:${step.status}:${step.memoized}`)
          .join("|");

        if (signature !== lastSignature) {
          lastSignature = signature;
          lastProgressAt = now;
        } else if (now - lastProgressAt > STALL_TIMEOUT_MS) {
          replay("Live run stalled", trigger.supportRunId);
          return;
        }

        setRun((current) => ({
          ...current,
          phase: phaseFor(timeline),
          timeline,
          runId: status?.runId ?? timeline.runId,
          traceUrl: status?.traceUrl ?? current.traceUrl,
        }));

        if (timeline.status === "completed") return;

        if (timeline.status === "failed") {
          setRun((current) => ({
            ...current,
            phase: "failed",
            error: "Run failed after exhausting retries",
          }));
          return;
        }
      }
    },
    [],
  );

  return { run, start, reset };
}

async function runReplay({
  ticketId,
  turn,
  failureArmed,
  supportRunId,
  reason,
  isCurrent,
  setRun,
}: {
  ticketId: SupportTicketId;
  turn: SupportTurn;
  failureArmed: boolean;
  supportRunId: string;
  reason: string;
  isCurrent: () => boolean;
  setRun: React.Dispatch<React.SetStateAction<AgentRun>>;
}) {
  const startedAt = Date.now();

  while (isCurrent()) {
    const timeline = buildReplayTimeline({
      runId: `replay-${supportRunId.slice(0, 8)}`,
      ticketId,
      turn,
      elapsedMs: Date.now() - startedAt,
      failureArmed,
      startedAt,
    });

    setRun((current) => ({
      ...current,
      phase: phaseFor(timeline),
      supportRunId,
      runId: null,
      timeline,
      simulated: true,
      replayReason: reason,
      traceUrl: getDeepLink("runTrace"),
    }));

    if (timeline.status === "completed") return;

    await wait(REPLAY_TICK_MS);
  }
}

function phaseFor(timeline: RunTimeline): RunPhase {
  if (timeline.status === "completed") return "complete";
  if (timeline.status === "failed") return "failed";
  if (timeline.steps.some((step) => step.status === "retrying")) return "retrying";
  return "running";
}

async function fetchStatus(trigger: TriggerResponse): Promise<StatusResponse> {
  const params = new URLSearchParams({ supportRunId: trigger.supportRunId });

  if (trigger.inngestEventId) {
    params.set("inngestEventId", trigger.inngestEventId);
  }

  const response = await fetch(`/api/support/status?${params}`, {
    cache: "no-store",
  });

  return (await response.json()) as StatusResponse;
}

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
