import { encryptionMiddleware } from "@inngest/middleware-encryption";
import { Inngest, eventType, staticSchema } from "inngest";
import type { DemoFlags } from "@/lib/demo-flags";

export type QueryRequestedData = {
  prompt: string;
  flags: DemoFlags;
  clientRunId: string;
  requestedAt: string;
  source: "booth-demo";
};

export type QuerySavedData = {
  runId: string;
  signal: "saved" | "discarded";
  savedAt: string;
  source: "booth-demo";
};

export const queryRequested = eventType("app/query.requested", {
  schema: staticSchema<QueryRequestedData>(),
});

export const querySaved = eventType("app/query.saved", {
  schema: staticSchema<QuerySavedData>(),
});

const middleware = process.env.INNGEST_ENCRYPTION_KEY
  ? [encryptionMiddleware({ key: process.env.INNGEST_ENCRYPTION_KEY })]
  : [];

export const inngest = new Inngest({
  id: "agent-evals-booth-demo",
  middleware,
});
