/**
 * Every word the Acme Support console shows, in one place.
 *
 * The console is written as Acme's own product: a helpdesk whose AI agent
 * happens to be built on Inngest. Inngest only appears where a real product
 * would link to it (the trace, the score, the experiment) and in the
 * "Built on Inngest" mark, so the booth story is "this is your product; now
 * here is what it looks like in Inngest".
 */

export const consoleCopy = {
  brand: "Acme",
  product: "Support",
  builtOn: "Built on Inngest",
  inbox: {
    title: "Inbox",
    groups: {
      good: "Goes well",
      bad: "Goes badly",
    },
    open: (count: number) => `${count} open`,
    status: {
      open: "Open",
      working: "Agent working",
      resolved: "Resolved",
      escalated: "Escalated",
    },
  },
  outage: {
    label: "Simulate Order API outage",
    short: "Order API outage",
    hint: "The order lookup returns a 503 once per run.",
  },
  cta: {
    title: "Try Inngest free",
    body: "Build this agent yourself.",
  },
  empty: {
    title: "Pick a ticket from the inbox",
    body: "Acme's AI agent answers it live: reads the ticket, looks up the customer and order, drafts a reply, checks it against policy, and sends it.",
  },
  thread: {
    agent: "Acme Agent",
    agentWorking: "Working on this ticket…",
    followUpAgent: "Acme Agent · follow-up",
    typing: (name: string) => `${name.split(" ")[0]} is typing…`,
    collapsed: (steps: number, seconds: string) => `${steps} steps · ${seconds}`,
    replay: "Offline replay",
    replayHint: "Live run unavailable: showing a recorded run.",
  },
  activity: {
    waiting: "Waiting",
    running: "Running…",
    failed: (source: string) => `${source} returned 503 Service Unavailable`,
    retryIn: (seconds: number) => `Retrying in ${seconds}s`,
    retryNow: "Retrying now…",
    recovered: "Recovered on retry",
    kept: "Cached",
    sandboxed: "Sandboxed",
    sandbox: {
      show: "Show sandbox",
      hide: "Hide sandbox",
      script: "Refund script",
      lifecycle: "Lifecycle",
      output: "Output",
      waiting: "Waiting for the script…",
      simulated:
        "Simulated locally: no sandbox is created. Cloud mode runs this script in an Inngest sandbox.",
    },
    flagged: "Escalated to a human",
    reply: (model: string, tokens: number) =>
      `${model} · ${tokens.toLocaleString("en-US")} tokens`,
  },
  escalation: {
    blocked: "Blocked by policy",
    note: "Escalated to Tier 2 · a teammate will reply within the hour",
  },
  feedback: {
    prompt: "Was this reply helpful?",
    good: "Helpful",
    bad: "Not helpful",
    pending: "Recording…",
    recorded: "Recorded in Inngest",
    sent: "Sent to Inngest",
    offline: "Saved locally: Inngest unreachable",
  },
  sent: {
    label: (customer: string) => `Reply sent to ${customer}`,
  },
  split: {
    button: "Split-test a model",
    title: "Try a new model on live tickets",
    body: (runs: number, current: string, challenger: string) =>
      `Route the next ${runs} tickets 50/50 between ${current} (current) and ${challenger}. Every answer is scored.`,
    start: "Start split test",
    running: "Routing tickets…",
    progress: (done: number, total: number) => `${done} of ${total} tickets scored`,
    replay: "Offline replay: live split test unavailable",
    again: "Run again",
  },
};

export const inngestLinks = {
  trace: "View trace in Inngest",
  traceShort: "View trace",
  experiment: "Compare in Inngest",
};

export const keyHints: Array<{ keys: string; label: string }> = [
  { keys: "1 2 3 4", label: "Open ticket (1–3 go well, 4 goes badly)" },
  { keys: "G / B", label: "Vote helpful / not helpful" },
  { keys: "S", label: "Split-test a model" },
  { keys: "D", label: "Open in Inngest" },
  { keys: "U", label: "Under the hood (code)" },
  { keys: "F", label: "Toggle outage" },
  { keys: "R", label: "Reset" },
  { keys: "Esc", label: "Close" },
  { keys: "?", label: "Keys" },
];
