/**
 * Every word the booth screen shows, in one place.
 *
 * Each screen has a business line (always visible, written for someone who
 * has never seen Inngest) and a technical line (shown with "Under the hood",
 * written for the engineer who wants to know how). Same story, two depths:
 * the driver never switches demos, only the depth.
 *
 * Product vocabulary on screen ("A/B test", "metric"), SDK names only in the
 * technical lines and the code (createScorer, step.score, group.experiment).
 */

export const boothTagline = "Unbreakable agents, invisible infra.";

export type BoothScreenId = "start" | "durable" | "observe" | "abtest" | "recap";

export const boothScreens: Array<{ id: BoothScreenId; label: string }> = [
  { id: "start", label: "Pick a ticket" },
  { id: "durable", label: "Durable" },
  { id: "observe", label: "Observe" },
  { id: "abtest", label: "A/B test" },
  { id: "recap", label: "Recap" },
];

export const startCopy = {
  eyebrow: "Inngest · live demo",
  headline: "Watch an AI support agent survive an outage, show its work, and get better.",
  prompt: "Pick a customer ticket",
  technical: "One Inngest function, six durable steps. Nothing else to run.",
};

export const durableCopy = {
  eyebrow: "1 · Durable execution",
  headline: "The agent answers the ticket, even when the order system goes down.",
  failureArmed: "Order API outage armed",
  failureOff: "Outage off",
  callout: {
    failing: "Order API down: 503",
    retrying: (seconds: number) => `Inngest retries in ${seconds}s`,
    recovered: "Recovered on retry",
  },
  business: {
    running: "Six steps, one after another. Watch the order lookup.",
    retrying: "The order system is down. Inngest waits, then tries that one step again.",
    done: (replayed: number) =>
      replayed > 0
        ? `Recovered. The ${replayed} finished steps weren't re-run: no repeat model spend, and the customer never noticed.`
        : "Done. Every step ran once, in order, and Inngest kept each result.",
  },
  technical:
    "Each step.run is a durability boundary. The failed step retries alone; finished steps replay from memoized state instead of executing again.",
  customerLabel: "Customer",
  agentLabel: "Support agent",
  drafting: "Drafting a reply…",
  memoized: "Not re-run",
};

export const observeCopy = {
  eyebrow: "2 · Observability",
  headline: "Every step, every retry, every token: captured by default.",
  business: "Nobody wrote logging for this. When a customer asks what happened, the answer is already here.",
  technical:
    "Traces, step inputs and outputs, and retries are recorded by the platform, with OpenTelemetry spans for model and API calls. Insights queries them with SQL.",
  totals: { time: "Total time", tokens: "Tokens", cost: "Model cost" },
  /** Trace table header, in column order. */
  columns: ["Step", "Timeline · output", "Duration", "Tokens", "Model cost"],
  failedAttempt: "503 · retried",
  waitingForRetry: "Waiting to retry",
  openInInngest: "Open this run in Inngest",
  costFootnote: "Illustrative model pricing.",
};

export const abTestCopy = {
  eyebrow: "3 · A/B testing",
  headline: "Is the agent any good? Measure it, then let the data pick the model.",
  feedback: {
    title: "Was this reply good?",
    good: "Good reply",
    bad: "Needs work",
    recorded: "Metric recorded on this run",
    sent: "Sent to Inngest",
    pendingReceipt: "Recording…",
    offline: "Recorded on screen only: Inngest unreachable",
    explainer:
      "Scores from people, business rules, or an LLM judge all land on the exact run they judged.",
  },
  split: {
    title: "Would another model do better?",
    run: "Run split test",
    running: "Splitting real traffic…",
    winner: "Winner",
    runsLabel: "tickets",
    quality: "Quality",
    cost: "/ ticket",
    simulated: "Replay: live split test unavailable",
    feed: {
      idle: (runs: number) =>
        `${runs} real tickets, split 50/50 between the two models. Every answer gets scored.`,
      starting: "Sending tickets…",
      routed: (index: number, total: number, ticket: string, model: string, score: string) =>
        `Ticket ${index} of ${total} · “${ticket}” → ${model} · scored ${score}`,
      done: (total: number, counts: string) =>
        `${total} tickets split · ${counts} · every answer scored`,
    },
  },
  business:
    "Real tickets are split between two models and every answer is scored. The winner is picked by data, not by opinion.",
  technical:
    "step.score attaches the vote to this exact run. group.experiment splits traffic 50/50 across variants, and a variant is just a function: model, prompt, retriever, or vendor.",
};

export const recapCopy = {
  eyebrow: "Recap",
  headline: "One function. Durable, observable, and measured.",
  pillars: {
    durable: "Survived an outage",
    observe: "Every step traced",
    abtest: "Winner picked by data",
  },
  roiVolume: 100_000,
  roiLabel: (tickets: string, winner: string, saved: string) =>
    `At ${tickets} tickets a month, switching to ${winner} saves ${saved} a month in model spend.`,
  roiFootnote: "Illustrative: from this demo's split test and example model pricing.",
  qrLabel: "Build this yourself",
  technical: "The primitives behind it",
};

export const replayTag = "Replay: live run unavailable";

export const inngestLinks = {
  trace: "View trace in Inngest",
  experiment: "View split test in Inngest",
};

export const keyHints: Array<{ keys: string; label: string }> = [
  { keys: "→ / Space", label: "Next" },
  { keys: "←", label: "Back" },
  { keys: "1 2 3", label: "Pick ticket · vote" },
  { keys: "U", label: "Under the hood" },
  { keys: "F", label: "Toggle outage" },
  { keys: "D", label: "Open in Inngest" },
  { keys: "R", label: "Reset" },
  { keys: "?", label: "Keys" },
];
