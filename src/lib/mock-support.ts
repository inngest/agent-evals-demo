import { RetryAfterError } from "inngest";
import {
  getSupportStep,
  getSupportTicket,
  getTicketOutputs,
  type SupportStepId,
  type SupportTicketId,
  type SupportTurn,
} from "@/content/support-demo";
import { startPostSpan, startGenAISpan } from "./otel";
import { recordStepInput } from "@/inngest/middlewares/step-tracker";
import { modelProvider } from "@/lib/demo-models";
import {
  completeChat,
  isOpenRouterConfigured,
  OPENROUTER_MODEL,
} from "@/lib/openrouter";

type SupportCallOptions = {
  ticketId: SupportTicketId;
  turn: SupportTurn;
  /** The model this run narrates, for the gen_ai span. */
  model: string;
  attempt: number;
  failStep?: SupportStepId;
  /** Executor run id, used to record the step input on the live timeline */
  runId?: string;
  /** Meaningful input payload for this step, shown in the demo timeline */
  input?: unknown;
};

/**
 * How long Inngest waits before retrying the 503. Long enough for the booth
 * to see the retry countdown, short enough that the whole run stays well
 * under twenty seconds.
 */
export const FAILURE_RETRY_AFTER = "3s";
export const FAILURE_RETRY_AFTER_MS = 3000;

// The 503 beat fires exactly once per executor run id. Keying by runId (not a
// module flag with an attempt-based reset) is stable across the function
// re-executions Inngest performs to retry the failed step, in both local dev
// and cloud mode: the same run never re-fails, the next run fails fresh.
const crashedRuns = new Set<string>();

export async function runSupportCall(
  id: SupportStepId,
  options: SupportCallOptions,
) {
  const step = getSupportStep(id);
  const ticket = getSupportTicket(options.ticketId);
  const canned = getTicketOutputs(ticket, options.turn)[id];

  if (options.runId && options.input !== undefined) {
    recordStepInput(options.runId, id, options.input);
  }

  // Only the reply is worth a real model call: it is the one output the
  // audience reads. Classification stays canned so the run stays fast.
  const useOpenRouter = id === "call-llm-draft-reply" && isOpenRouterConfigured();

  let span = null;
  if (step.kind === "llm") {
    const spanModel = useOpenRouter ? OPENROUTER_MODEL : options.model;
    span = await startGenAISpan(`chat ${spanModel}`, {
      "gen_ai.request.model": spanModel,
      "gen_ai.provider.name": modelProvider(spanModel),
    });
  } else if (step.kind === "api") {
    span = await startPostSpan(`https://api.acme-shop.com/${id}`);
  }

  if (!useOpenRouter) {
    await new Promise((resolve) => setTimeout(resolve, step.latencyMs));
  }

  // Fire the beat once per run, regardless of how the executor reports
  // attempts across step-retry re-invocations.
  const beatKey = options.runId ?? "anonymous";
  const fireFailureBeat =
    options.failStep === id &&
    options.attempt === 0 &&
    !crashedRuns.has(beatKey);

  if (span) {
    if (fireFailureBeat) {
      span.setAttribute("http.response.status_code", 503);
    }
    await span.end();
  }

  if (fireFailureBeat) {
    if (crashedRuns.size > 500) crashedRuns.clear();
    crashedRuns.add(beatKey);
    throw new RetryAfterError(
      `${step.source} returned 503 Service Unavailable`,
      FAILURE_RETRY_AFTER,
    );
  }

  if (useOpenRouter) {
    return runRealReply(id, ticket.message, options);
  }

  return {
    id,
    label: step.label,
    source: step.source,
    output: canned.output,
    tokens: canned.tokens,
    flagged: canned.flagged === true,
  };
}

async function runRealReply(
  id: SupportStepId,
  message: string,
  options: SupportCallOptions,
) {
  const input = (options.input ?? {}) as Record<string, unknown>;
  const context = Object.entries(input)
    .map(([key, value]) =>
      `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
    )
    .join("\n");
  const ticket = getSupportTicket(options.ticketId);
  const customerMessage =
    options.turn === 2 && ticket.followUp
      ? `${message}\nCustomer follow-up: ${ticket.followUp.message}`
      : message;
  const completion = await completeChat({
    system:
      "You are a warm, concise customer-support agent for an online store. Reply to the customer in 2-3 sentences using only the facts provided. No sign-off.",
    prompt: `${context}\n\nCustomer message: ${customerMessage}`,
  });

  return {
    id,
    label: getSupportStep(id).label,
    source: `openrouter · ${completion.model}`,
    output: completion.text,
    tokens: completion.usage.totalTokens,
    flagged: false,
  };
}
