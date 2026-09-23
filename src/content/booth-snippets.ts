import { challengerSupportModel, currentSupportModel } from "@/content/support-demo";

const current = JSON.stringify(currentSupportModel);
const challenger = JSON.stringify(challengerSupportModel);

/**
 * Code shown in the "Under the hood" drawer, one snippet per screen (two for
 * the A/B screen, which the drawer follows as the driver moves from the vote
 * to the split test).
 *
 * Trimmed from the real functions in src/inngest/functions/ so an engineer can
 * read each one in ten seconds. `@demo-highlight` markers pick the lines the
 * drawer emphasises.
 */
export type BoothSnippetId =
  | "durable"
  | "observe"
  | "abtest-feedback"
  | "abtest-split"
  | "recap";

export type BoothSnippet = {
  id: BoothSnippetId;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

const durableCode = `export const supportAgent = createFunction(
  { id: "support-agent", retries: 4, triggers: [ticketReceived] },
  async ({ event, step }) => {
    const intent = await step.run("classify-ticket", () =>
      llm.classify(event.data.message)
    );
    const customer = await step.run("lookup-customer", () =>
      crm.getCustomer(event.data.customerId)
    );
    // @demo-highlight-start
    // A 503 here retries ONLY this step. The two steps above
    // are replayed from memoized state, not run again.
    const order = await step.run("lookup-order", () =>
      orders.get(event.data.orderId)
    );
    // @demo-highlight-end
    const reply = await step.run("draft-reply", () =>
      llm.draftReply({ intent, customer, order })
    );
    await step.run("policy-check", () => guardrails.check(reply));
    await step.run("send-reply", () => helpdesk.reply(reply));
  }
);`;

const observeCode = `// Nothing to add. Every run, step, input, output,
// retry and duration is traced by the platform.
const order = await step.run("lookup-order", () =>
  orders.get(event.data.orderId)
);

// Then ask questions across every run in Insights, with SQL:
// @demo-highlight-start
const ticketsToday = \`
  SELECT count(*)
  FROM events
  WHERE name = 'support/run.completed'\`;
// @demo-highlight-end`;

const feedbackCode = `// The visitor's vote becomes a metric on THIS run.
export const supportScoreRun = inngest.createFunction(
  { id: "support-agent-score-run", triggers: [feedbackRecorded] },
  async ({ event, step }) => {
    // @demo-highlight-start
    await step.score("attach-human-feedback-score", {
      runId: event.data.parentRunId,
      name: "support_human_feedback",
      value: event.data.signal === "good" ? 1 : 0,
    });
    // @demo-highlight-end
  }
);`;

const splitCode = `// A variant is just a function: model, prompt,
// retriever, vendor, threshold.
// @demo-highlight-start
const { result, experimentRef } = await group.experiment(
  "support-agent-model-split-test",
  {
    variants: {
      ${current}: () => answerWith(${current}),
      ${challenger}: () => answerWith(${challenger}),
    },
    select: experiment.weighted({
      ${current}: 50,
      ${challenger}: 50,
    }),
  }
);
// @demo-highlight-end

await inngest.score.experiment({
  experiment: experimentRef,
  name: "support_reply_quality",
  value: result.qualityScore,
});`;

const recapCode = `// The whole agent is ordinary code. Inngest adds:
step.run(...)          // durable steps, retries, memoized replays
step.score(...)        // metrics attached to the run
group.experiment(...)  // split traffic, measure every variant`;

export const boothSnippets: BoothSnippet[] = [
  {
    id: "durable",
    label: "Durable steps",
    eyebrow: "step.run",
    description: "Six steps, each a durability boundary.",
    code: durableCode,
  },
  {
    id: "observe",
    label: "Traces + Insights",
    eyebrow: "for free",
    description: "No instrumentation code. Query every run with SQL.",
    code: observeCode,
  },
  {
    id: "abtest-feedback",
    label: "Human feedback",
    eyebrow: "step.score",
    description: "A vote becomes a metric on the exact run it judged.",
    code: feedbackCode,
  },
  {
    id: "abtest-split",
    label: "Split test",
    eyebrow: "group.experiment",
    description: "Split real traffic across variants and score each one.",
    code: splitCode,
  },
  {
    id: "recap",
    label: "Primitives",
    eyebrow: "the SDK",
    description: "Three primitives on top of ordinary code.",
    code: recapCode,
  },
];
