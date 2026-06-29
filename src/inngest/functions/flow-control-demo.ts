import {
  flowControlDemoRequested,
  inngest,
  type FlowControlDemoRequestedData,
} from "@/inngest/client";

const DEFAULT_WORK_MS = 7500;
const MAX_WORK_MS = 9000;

export const flowControlDemo = inngest.createFunction(
  {
    id: "flow-control-demo",
    name: "Flow control demo",
    retries: 1,
    throttle: {
      limit: 2,
      period: "10s",
      key: "event.data.accountId",
    },
    concurrency: {
      limit: 1,
      key: "event.data.accountId",
    },
    triggers: [flowControlDemoRequested],
  },
  async ({ event, step }) => {
    const data = event.data as FlowControlDemoRequestedData;
    const workMs = normalizeWorkMs(data.workMs);
    const startedAt = new Date().toISOString();

    const simulatedApiCall = await step.run("simulate-expensive-api-call", async () => {
      await sleep(workMs);

      return {
        accountName: data.accountName,
        workMs,
        completedAt: new Date().toISOString(),
      };
    });

    return {
      batchId: data.batchId,
      requestId: data.requestId,
      accountId: data.accountId,
      requestedAt: data.requestedAt,
      startedAt,
      ...simulatedApiCall,
    };
  }
);

function normalizeWorkMs(value: unknown): number {
  const workMs = Number(value ?? DEFAULT_WORK_MS);

  if (!Number.isFinite(workMs)) {
    return DEFAULT_WORK_MS;
  }

  return Math.max(1000, Math.min(MAX_WORK_MS, Math.floor(workMs)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
