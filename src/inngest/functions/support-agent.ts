import {
  FAILURE_STEP_ID,
  buildSupportRunSummary,
  currentSupportModel,
  getSupportTicket,
  supportSessionId,
  supportSteps,
  type SupportRunSummary,
  type SupportStepId,
} from "@/content/support-demo";
import {
  inngest,
  supportRunCompleted,
  supportTicketReceived,
  type SupportTicketReceivedData,
} from "@/inngest/client";
import { supportCsat, supportFcr } from "@/inngest/functions/support-deferred";
import { runSupportCall } from "@/lib/mock-support";
import { isCloud } from "@/lib/demo-target";
import { SANDBOX_ENABLED } from "@/lib/feature-flags";
import {
  destroySandboxesNamed,
  runSandboxRefund,
  sandboxNameForRun,
  type SandboxRefundResult,
} from "@/lib/sandbox";
import { isOpenRouterConfigured, OPENROUTER_MODEL } from "@/lib/openrouter";
import {
  supportSessionKey,
  supportSessionMeta,
} from "@/lib/support-session-meta";

export type SupportAgentResult = SupportRunSummary & {
  parentRunId?: string;
  reply: string;
};

export const supportAgent = inngest.createFunction(
  {
    id: "support-agent",
    name: "Support agent",
    retries: 4,
    triggers: [supportTicketReceived],
    // A run that dies between creating and destroying its sandbox would
    // leave it running until its timeout. Sweep it up by name.
    onFailure: async ({ event, runId }) => {
      const original = event.data.event.data as Partial<SupportTicketReceivedData>;
      await destroySandboxesNamed(
        sandboxNameForRun(original.supportRunId ?? `support-${runId}`),
      );
    },
  },
  async ({
    event,
    step,
    attempt,
    runId,
    defer,
  }): Promise<SupportAgentResult> => {
    const data = event.data as Partial<SupportTicketReceivedData>;
    const supportRunId = data.supportRunId ?? `support-${runId}`;
    const ticket = getSupportTicket(data.ticketId);
    const turn = data.turn ?? 1;
    // With OpenRouter configured, the real model id is the honest narrative:
    // it is what actually writes the reply. The payload's model only drives
    // the mock-mode story.
    const model = isOpenRouterConfigured()
      ? OPENROUTER_MODEL
      : (data.model ?? currentSupportModel);
    const failStep: SupportStepId | undefined =
      data.failureStep === "none" || turn === 2
        ? undefined
        : (data.failureStep ?? FAILURE_STEP_ID);
    const sessionId =
      event.meta?.sessions?.[supportSessionKey] ?? supportSessionId;
    const call = (id: SupportStepId, input: unknown) =>
      runSupportCall(id, {
        ticketId: ticket.id,
        turn,
        model,
        attempt,
        failStep,
        runId,
        input,
      });

    // Each step.run is a durability boundary: if the order API 503s, Inngest
    // retries that one step and replays the finished ones from memoized
    // state instead of calling the model again.
    const message =
      turn === 2 && ticket.followUp ? ticket.followUp.message : ticket.message;
    const intent = await step.run("classify-ticket", () =>
      call("classify-ticket", { message, model }),
    );
    const customer = await step.run("lookup-customer", () =>
      call("lookup-customer", { customer: ticket.customer }),
    );
    const order = await step.run("lookup-order", () =>
      call("lookup-order", { customer: ticket.customer }),
    );
    const reply = await step.run("call-llm-draft-reply", () =>
      call("call-llm-draft-reply", {
        model,
        intent: intent.output,
        customer: customer.output,
        order: order.output,
      }),
    );
    // A refund is money arithmetic: the agent writes a script for it and runs
    // it in a sandbox, not in its head and not in this process. The steps are
    // durable like any other: every later re-entry replays the result instead
    // of creating a new sandbox.
    const refund: SandboxRefundResult | null =
      SANDBOX_ENABLED && ticket.id === "damaged-item" && turn === 1
        ? await runSandboxRefund({ step, supportRunId })
        : null;
    // The guardrail: a draft that breaks policy (a refund over the
    // auto-approve limit) is never sent. It goes to a human instead.
    const policy = await step.run("policy-check", async () => {
      const result = await call("policy-check", {
        reply: reply.output,
        ...(refund ? { refundUsd: refund.refund.refundUsd } : {}),
      });
      return {
        ...result,
        ...(refund
          ? {
              output: `${result.output} · $${refund.refund.refundUsd.toFixed(2)} computed in ${refund.mode === "sandbox" ? "a sandbox" : "a simulated sandbox"}`,
            }
          : {}),
        passed: !result.flagged,
      };
    });
    await step.run("send-reply", () =>
      call("send-reply", {
        customer: ticket.customer,
        action: policy.passed ? "reply" : "escalate-to-tier-2",
      }),
    );

    const summary = buildSupportRunSummary({
      supportRunId,
      ticketId: ticket.id,
      model,
      turn,
    });

    if (isCloud) {
      await step.metadata("attach-support-run-metadata").update(
        {
          supportRunId,
          ticketId: ticket.id,
          model: summary.model,
          tokenCount: summary.tokenCount,
          costUsd: summary.costUsd,
          qualityScore: summary.qualityScore,
          failureStep: failStep ?? "none",
          turn,
          escalated: summary.escalated,
          source: "booth-demo",
        },
        "userland.support",
      );
    }

    // The durable boundary that lets the scorer attach metrics to this run.
    await step.sendEvent(
      "emit-support-run-completed",
      supportRunCompleted.create(
        {
          ...summary,
          parentRunId: isCloud ? runId : supportRunId,
          sessionId,
          source: "booth-demo",
        },
        {
          id: `support-completed:${supportRunId}`,
          meta: supportSessionMeta(sessionId),
        },
      ),
    );

    // The scores that are only known later. Each is a deferred function of
    // this run: it starts from here, knows this run as its parent, and
    // attaches its score back to it.
    const deferred = {
      supportRunId,
      ticketId: ticket.id,
      turn,
      escalated: summary.escalated,
    };
    defer("score-csat", { function: supportCsat, data: deferred });
    defer("score-first-contact-resolution", {
      function: supportFcr,
      data: deferred,
    });

    return {
      ...summary,
      parentRunId: isCloud ? runId : undefined,
      reply: reply.output,
    };
  },
);

export const supportStepCount = supportSteps.length;
