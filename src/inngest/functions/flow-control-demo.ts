import { RetryAfterError } from "inngest";
import {
  flowControlDemoRequested,
  inngest,
  type FlowControlDemoRequestedData,
} from "@/inngest/client";

const DEFAULT_WORK_MS = 7500;
const MAX_WORK_MS = 9000;
const RETRY_AFTER = "1s";

export const flowControlDemo = inngest.createFunction(
  {
    id: "flow-control-demo",
    name: "Customer enrichment queue",
    retries: 1,
    rateLimit: {
      limit: 10,
      period: "60s",
      key: "event.data.accountId",
    },
    throttle: {
      limit: 10,
      period: "10s",
      burst: 10,
      key: "event.data.accountId",
    },
    concurrency: {
      limit: 10,
      key: "event.data.accountId",
    },
    triggers: [flowControlDemoRequested],
  },
  async ({ event, step, attempt }) => {
    const data = event.data as FlowControlDemoRequestedData;
    const workMs = normalizeWorkMs(data.workMs);
    const failureMode = normalizeFailureMode(data.failureMode);
    const startedAt = new Date().toISOString();

    const customerEnrichment = await step.run("call-customer-enrichment-api", async () => {
      if (failureMode === "retry" && attempt === 0) {
        throw new RetryAfterError(
          "Customer enrichment API returned 429. Retrying after vendor reset.",
          RETRY_AFTER
        );
      }

      if (failureMode === "fail") {
        throw new Error("Customer enrichment API quota exhausted.");
      }

      await sleep(workMs);

      return {
        accountName: data.accountName,
        failureMode,
        workMs,
        completedAt: new Date().toISOString(),
      };
    });

    return {
      batchId: data.batchId,
      requestId: data.requestId,
      requestNumber: data.requestNumber,
      accountId: data.accountId,
      requestedAt: data.requestedAt,
      startedAt,
      attempt,
      ...customerEnrichment,
    };
  }
);

function normalizeFailureMode(value: unknown): "none" | "retry" | "fail" {
  return value === "retry" || value === "fail" ? value : "none";
}

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
