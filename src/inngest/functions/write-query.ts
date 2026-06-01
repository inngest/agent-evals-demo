import { inngest, queryRequested, querySaved } from "@/inngest/client";
import { generateSQL } from "@/lib/mock-llm";
import { runMockQuery } from "@/lib/mock-query";
import { normalizeDemoFlags } from "@/lib/demo-flags";
import { scoreSavedQuery } from "@/lib/scoring";

export const writeQuery = inngest.createFunction(
  {
    id: "write-query",
    retries: 4,
    triggers: [queryRequested],
  },
  async ({ event, step, attempt }) => {
    const flags = normalizeDemoFlags(event.data.flags);

    const sql = await step.run("generate-sql", () =>
      generateSQL(event.data.prompt, { flags, attempt })
    );

    const rows = await step.run("run-query", () =>
      runMockQuery(sql, flags.latencyMs)
    );

    return {
      sql,
      rows,
      rowCount: rows.length,
      clientRunId: event.data.clientRunId,
    };
  }
);

export const scoreQuerySignal = inngest.createFunction(
  {
    id: "score-query-signal",
    retries: 2,
    triggers: [querySaved],
  },
  async ({ event, step }) => {
    const score = await step.run("score-saved-query", () =>
      scoreSavedQuery(event.data.runId, event.data.signal)
    );

    return score;
  }
);

export const functions = [writeQuery, scoreQuerySignal];
