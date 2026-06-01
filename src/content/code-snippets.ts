export type CodeSnippet = {
  id: "durable" | "observable" | "optimize";
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

export const codeSnippets: CodeSnippet[] = [
  {
    id: "durable",
    label: "Act 1",
    eyebrow: "Durable",
    description:
      "The model call and query runner are durable steps, so the Opus outage is a retry beat instead of a dead demo.",
    code: `const writeQuery = inngest.createFunction(
  {
    id: "write-query",
    retries: 4,
    triggers: [queryRequested],
  },
  async ({ event, step }) => {
    // 1. Ask the model for SQL. A failure here is retried, not fatal.
    const sql = await step.run("generate-sql", () =>
      llm.generateSQL(event.data.prompt)
    );

    // 2. Run it. Each step is independently retried and memoized.
    const rows = await step.run("run-query", () => db.run(sql));

    // Your agent logic goes here.
    return { sql, rows };
  }
);`,
  },
  {
    id: "observable",
    label: "Act 2",
    eyebrow: "Observable",
    description:
      "Because the loop runs through Inngest, the step inputs, outputs, retries, timing, and replay path are already in the trace.",
    code: `const sql = await step.run("generate-sql", () =>
  llm.generateSQL(event.data.prompt)
);

const rows = await step.run("run-query", () => db.run(sql));

// Observability is the side effect of durable orchestration:
// - generate-sql input and output
// - retry attempt with "Opus unavailable: 503"
// - run-query timing and returned row count
// - event replay from the same payload`,
  },
  {
    id: "optimize",
    label: "Act 3",
    eyebrow: "Optimize",
    description:
      "Saving the query becomes a product-behavior signal that can score the agent asynchronously.",
    code: `// When the user SAVES the query, that is a signal the answer was good.
// Score it asynchronously. This can land seconds or days later.
await step.group.defer("score-on-save", async () => {
  // Your agent loop or scoring logic goes here.
  // group.defer -> score this query from real product behavior.
});

// TODO(launch): swap today's scoring stub for the real primitive
// as soon as group.defer ships.`,
  },
];
