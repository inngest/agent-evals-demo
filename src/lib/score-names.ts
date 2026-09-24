/**
 * The business metrics the support agent is scored on, named the way a
 * support lead talks, so the Inngest scores and experiment views read
 * without translation. Client-safe: the console and the snippets use them too.
 */
export const SCORE = {
  /** 1 when the reply resolved the ticket: no follow-up, no hand-off. */
  firstContactResolution: "first_contact_resolution",
  /** 1 when the draft passed the policy guardrail. */
  policyCompliance: "policy_compliance",
  /** 1 when the ticket was handed to a human instead of answered. */
  escalatedToHuman: "escalated_to_human",
  /** Model spend for this ticket, USD (illustrative pricing). */
  costPerTicket: "cost_per_ticket",
  /** The customer's thumbs up (1) or down (0). */
  csat: "csat",
  /** Scripted answer quality, used by the split test only. */
  replyQuality: "support_reply_quality",
} as const;

/** How long the scorer waits for the customer to follow up. In production: days. */
export const FOLLOW_UP_WINDOW = "15s";
export const FOLLOW_UP_WINDOW_MS = 15_000;

/** Scorer step ids: the console polls these as receipts. */
export const SCORE_STEPS = {
  policyCompliance: "attach-policy-compliance-score",
  costPerTicket: "attach-cost-per-ticket-score",
  escalatedToHuman: "attach-escalated-score",
  waitForFollowUp: "wait-for-customer-follow-up",
  firstContactResolution: "attach-first-contact-resolution",
  csat: "attach-human-feedback-score",
} as const;
