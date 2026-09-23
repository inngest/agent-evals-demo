/**
 * The booth scenario: a customer-support agent answering one ticket.
 *
 * Everything the agent "knows" lives here - the three preset tickets a visitor
 * can pick, the six durable steps, and the canned output each step produces
 * for each ticket. The Inngest function, the replay timeline, and the booth UI
 * all read from this one file so the screen can never describe a step the
 * function does not run.
 */

import { challengerModel, currentModel, modelRole } from "@/lib/demo-models";

/** Any model name; the two the booth uses come from env (lib/demo-models.ts). */
export type SupportModel = string;

/** The model the agent runs on today. The split test challenges it. */
export const currentSupportModel: SupportModel = currentModel;
export const challengerSupportModel: SupportModel = challengerModel;

export type SupportStepId =
  | "classify-ticket"
  | "lookup-customer"
  | "lookup-order"
  | "call-llm-draft-reply"
  | "policy-check"
  | "send-reply";

/**
 * The step the demo arms to fail once with a 503. An order API is the most
 * relatable dependency to go down: everyone has waited on one.
 */
export const FAILURE_STEP_ID = "lookup-order" satisfies SupportStepId;

/**
 * The step whose output is the reply shown in the chat bubble. The UI
 * string-matches this to pull the reply out of the captured timeline, so both
 * sides import it from here rather than repeating the literal.
 */
export const REPLY_STEP_ID = "call-llm-draft-reply" satisfies SupportStepId;

export type SupportStepKind = "llm" | "api" | "logic";

export type SupportStep = {
  id: SupportStepId;
  /** Short, big-type label for the pipeline node. */
  label: string;
  /** Where the work happens: shown under the label. */
  source: string;
  kind: SupportStepKind;
  detail: string;
  /** Canned latency, kept short so a full run fits the booth budget. */
  latencyMs: number;
};

export const supportSteps: SupportStep[] = [
  {
    id: "classify-ticket",
    label: "Read ticket",
    source: "LLM",
    kind: "llm",
    detail: "Classify the customer's intent and urgency.",
    latencyMs: 700,
  },
  {
    id: "lookup-customer",
    label: "Look up customer",
    source: "CRM",
    kind: "api",
    detail: "Fetch the customer's account, plan, and history.",
    latencyMs: 600,
  },
  {
    id: "lookup-order",
    label: "Look up order",
    source: "Order API",
    kind: "api",
    detail: "Fetch the order, shipment, and tracking status.",
    latencyMs: 700,
  },
  {
    id: "call-llm-draft-reply",
    label: "Draft reply",
    source: "LLM",
    kind: "llm",
    detail: "Write a reply grounded in the customer and order data.",
    latencyMs: 1500,
  },
  {
    id: "policy-check",
    label: "Policy check",
    source: "Guardrails",
    kind: "logic",
    detail: "Check the reply against refund and privacy policy.",
    latencyMs: 500,
  },
  {
    id: "send-reply",
    label: "Send reply",
    source: "Helpdesk",
    kind: "api",
    detail: "Post the reply to the customer's ticket.",
    latencyMs: 400,
  },
];

export type SupportTicketId = "where-is-my-order" | "damaged-item" | "change-address";

export type SupportStepOutput = { output: string; tokens: number };

export type SupportTicket = {
  id: SupportTicketId;
  /** Card title on the start screen. */
  title: string;
  /** One-word tag for the split-test chips. */
  tag: string;
  customer: string;
  message: string;
  outputs: Record<SupportStepId, SupportStepOutput>;
};

export const supportTickets: SupportTicket[] = [
  {
    id: "where-is-my-order",
    title: "Where's my order?",
    tag: "Order",
    customer: "Priya S.",
    message:
      "Hi, I ordered a standing desk nine days ago and it still says 'processing'. Where is it?",
    outputs: {
      "classify-ticket": {
        output: "Intent: order status · Urgency: medium · Sentiment: frustrated",
        tokens: 310,
      },
      "lookup-customer": {
        output: "Priya S. · Pro plan · 14 orders · no open tickets",
        tokens: 0,
      },
      "lookup-order": {
        output: "Order #48213 · shipped yesterday · UPS 1Z84… · arrives Thursday",
        tokens: 0,
      },
      "call-llm-draft-reply": {
        output:
          "Hi Priya, sorry for the wait! Your standing desk shipped yesterday with UPS and is due Thursday. Here's your tracking link. I've added free express shipping to your next order for the trouble.",
        tokens: 1840,
      },
      "policy-check": {
        output: "Passed · goodwill credit within limit · no PII leaked",
        tokens: 220,
      },
      "send-reply": { output: "Reply posted to ticket #9921", tokens: 0 },
    },
  },
  {
    id: "damaged-item",
    title: "Refund a damaged item",
    tag: "Refund",
    customer: "Marcus L.",
    message:
      "My blender arrived with a cracked jar. I'd like a refund, or at least a replacement.",
    outputs: {
      "classify-ticket": {
        output: "Intent: damaged item · Urgency: high · Sentiment: annoyed",
        tokens: 290,
      },
      "lookup-customer": {
        output: "Marcus L. · Standard plan · 3 orders · first complaint",
        tokens: 0,
      },
      "lookup-order": {
        output: "Order #47790 · delivered 2 days ago · within 30-day return window",
        tokens: 0,
      },
      "call-llm-draft-reply": {
        output:
          "Hi Marcus, I'm sorry your blender arrived damaged. A replacement jar ships today at no cost, and there's no need to send the cracked one back. If you'd rather have a refund, just reply and I'll process it right away.",
        tokens: 1760,
      },
      "policy-check": {
        output: "Passed · replacement within return window · no PII leaked",
        tokens: 210,
      },
      "send-reply": { output: "Reply posted to ticket #9934", tokens: 0 },
    },
  },
  {
    id: "change-address",
    title: "Change my shipping address",
    tag: "Address",
    customer: "Dana K.",
    message:
      "I just moved! Can you send my order to 22 Harbor St instead of my old place?",
    outputs: {
      "classify-ticket": {
        output: "Intent: address change · Urgency: high · Sentiment: neutral",
        tokens: 280,
      },
      "lookup-customer": {
        output: "Dana K. · Pro plan · 8 orders · address verified last month",
        tokens: 0,
      },
      "lookup-order": {
        output: "Order #48305 · packed, not yet shipped · address still editable",
        tokens: 0,
      },
      "call-llm-draft-reply": {
        output:
          "Hi Dana, congrats on the move! Your order hasn't shipped yet, so I've updated it to 22 Harbor St. You'll get a new tracking email as soon as it leaves the warehouse.",
        tokens: 1620,
      },
      "policy-check": {
        output: "Passed · address change before shipment · identity verified",
        tokens: 200,
      },
      "send-reply": { output: "Reply posted to ticket #9940", tokens: 0 },
    },
  },
];

export const defaultSupportTicketId: SupportTicketId = "where-is-my-order";

export const supportSessionId = "sess-support-booth";

/**
 * Model pricing for the demo's cost numbers, in USD per 1k tokens. Canned,
 * labelled as illustrative wherever it reaches the screen, and keyed by role
 * rather than name so any pair of models from env gets the same story: the
 * challenger is cheaper.
 */
const COST_PER_1K_TOKENS = {
  current: 0.024,
  challenger: 0.017,
} as const;

export function costPer1kTokens(model: string): number {
  return COST_PER_1K_TOKENS[modelRole(model)];
}

export type SupportRunSummary = {
  supportRunId: string;
  sessionId: string;
  ticketId: SupportTicketId;
  // Narrative models ("claude-opus-4.8") in mock mode, real OpenRouter model
  // ids ("openai/gpt-5.5") when the key is configured.
  model: string;
  qualityScore: number;
  tokenCount: number;
  costUsd: number;
  completedAt: string;
};

export function getSupportStep(id: SupportStepId): SupportStep {
  const step = supportSteps.find((item) => item.id === id);

  if (!step) {
    throw new Error(`Unknown support step: ${id}`);
  }

  return step;
}

export function getSupportTicket(id: string | undefined): SupportTicket {
  return (
    supportTickets.find((ticket) => ticket.id === id) ??
    (supportTickets[0] as SupportTicket)
  );
}

export function isSupportTicketId(value: unknown): value is SupportTicketId {
  return supportTickets.some((ticket) => ticket.id === value);
}

export function ticketTokenCount(ticket: SupportTicket): number {
  return supportSteps.reduce(
    (sum, step) => sum + ticket.outputs[step.id].tokens,
    0,
  );
}

export function buildSupportRunSummary(args: {
  supportRunId: string;
  ticketId: SupportTicketId;
  model?: string;
  completedAt?: string;
  qualityScore?: number;
}): SupportRunSummary {
  const ticket = getSupportTicket(args.ticketId);
  const model = args.model ?? currentSupportModel;
  const tokenCount = ticketTokenCount(ticket);

  return {
    supportRunId: args.supportRunId,
    sessionId: supportSessionId,
    ticketId: ticket.id,
    model,
    qualityScore:
      args.qualityScore ?? (modelRole(model) === "challenger" ? 0.91 : 0.84),
    tokenCount,
    costUsd: roundCost((tokenCount / 1000) * costPer1kTokens(model)),
    completedAt: args.completedAt ?? new Date().toISOString(),
  };
}

function roundCost(value: number): number {
  return Math.round(value * 10000) / 10000;
}
