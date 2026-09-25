import { challengerSupportModel, currentSupportModel } from "@/content/support-demo";

const current = JSON.stringify(currentSupportModel);
const challenger = JSON.stringify(challengerSupportModel);

/**
 * Code shown in the "Under the hood" drawer. The drawer follows what the
 * console is doing: the agent's steps while a ticket is worked, the scorer
 * after a vote, and the experiment while the split test is open.
 *
 * Trimmed from the real functions in src/inngest/functions/ so an engineer can
 * read each one in ten seconds. `@demo-highlight` markers pick the lines the
 * drawer emphasises.
 */
export type BoothSnippetId = "durable" | "scores" | "abtest-split";

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
    // Refund maths runs as code in a sandbox, not in the model's head.
    const box = await step.sandbox.create("create-refund-sandbox");
    const refund = await box.commands.run("compute-refund", refundScript);
    await box.destroy("destroy-refund-sandbox");
    const reply = await step.run("draft-reply", () =>
      llm.draftReply({ intent, customer, order, refund })
    );
    const policy = await step.run("policy-check", () =>
      guardrails.check(reply, refund) // refunds over $200 need a human
    );
    await step.run("send-reply", () =>
      policy.passed ? helpdesk.reply(reply) : helpdesk.escalate(reply)
    );
  }
);`;

const scoresCode = `// The agent's last line: a score that is only known later
// is a deferred function of this run.
// @demo-highlight-start
defer("score-fcr", { function: firstContactResolution, data: run });
// @demo-highlight-end

// Did it resolve the ticket? Wait for the customer, durably.
export const firstContactResolution = createDefer(inngest,
  { id: "support-agent-resolution" },
  async ({ event, parents, step }) => {
    const run = event.data;
    const followUp = await step.waitForEvent("wait-for-customer-follow-up", {
      event: "support/ticket.received",
      if: \`async.data.followUpOf == '\${run.supportRunId}'\`,
      timeout: "2d",
    });
    // parents[0] is the agent run: the score lands on it.
    await step.score("fcr", { runId: parents[0].runId,
      name: "first_contact_resolution",
      value: followUp || run.escalated ? 0 : 1 });
  }
);

// The 👍/👎 triggers its own scorer, attached to the same run:
//   step.score(..., { name: "csat", value: signal === "good" ? 1 : 0 })`;

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

// Scored on the same business metrics as every live run.
await inngest.score.experiment({
  experiment: experimentRef,
  name: "first_contact_resolution",
  value: result.firstContactResolution,
});`;

export const boothSnippets: BoothSnippet[] = [
  {
    id: "durable",
    label: "Durable steps",
    eyebrow: "step.run",
    description: "Six steps, each a durability boundary.",
    code: durableCode,
  },
  {
    id: "scores",
    label: "Business scores",
    eyebrow: "defer + step.score",
    description: "Scores known later are deferred functions of the run they judge.",
    code: scoresCode,
  },
  {
    id: "abtest-split",
    label: "Split test",
    eyebrow: "group.experiment",
    description: "Split real traffic across variants and score each one.",
    code: splitCode,
  },
];
