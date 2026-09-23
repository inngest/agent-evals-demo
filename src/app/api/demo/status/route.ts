import { NextResponse } from "next/server";
import { isCloud, DEMO_TARGET } from "@/lib/demo-target";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { checkSandboxAccess } from "@/lib/sandbox";
import { SANDBOX_ENABLED } from "@/lib/feature-flags";
import { isOpenRouterConfigured, OPENROUTER_MODEL } from "@/lib/openrouter";
import { getTimelineStoreStats } from "@/inngest/middlewares/step-tracker";
import { currentSupportModel } from "@/content/support-demo";

export async function GET() {
  const sandbox = await checkSandboxAccess();
  // The client's actual mode comes from DEMO_TARGET (client.ts: isDev = !isCloud),
  // not from INNGEST_DEV. Report both so a DEMO_TARGET-less production deploy
  // (client silently in dev mode) is visible instead of masked as "cloud".
  const isDevMode = process.env.INNGEST_DEV === "1";
  const clientInDevMode = !isCloud;
  const modeConflict = isCloud && isDevMode;
  const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
  const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY);
  const hasApiKey = Boolean(process.env.INNGEST_API_KEY);
  const hasInsightsQuery = Boolean(process.env.INNGEST_INSIGHTS_SCORE_QUERY);
  const hasInsightsUrl = Boolean(process.env.NEXT_PUBLIC_INNGEST_INSIGHTS_URL);
  const hasDashboardUrl = Boolean(
    process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_BASE ||
      process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_URL
  );
  const dashboardUrl = getDeepLink("envDashboard");
  const runsUrl = getDeepLink("runTrace");

  return NextResponse.json({
    ok: true,
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      demoTarget: DEMO_TARGET,
      // Truthful client mode (DEMO_TARGET-derived). Scripts key off this to
      // flag dev-mode deployments; the old INNGEST_DEV-only check masked a
      // DEMO_TARGET-less production deploy as "cloud".
      inngestMode: clientInDevMode ? "dev" : "cloud",
      inngestDevEnvVarSet: isDevMode,
      modeConflict,
      dashboardUrl,
      runsUrl,
    },
    configuration: {
      hasEventKey,
      hasSigningKey,
      hasEncryptionKey: Boolean(process.env.INNGEST_ENCRYPTION_KEY),
      hasApiKey,
      hasInsightsQuery,
      hasInsightsUrl,
      hasDashboardUrl,
      inngestEnv: process.env.INNGEST_ENV ?? null,
    },
    readiness: {
      canSendCloudEvents: isDevMode || hasEventKey,
      canServeCloudInngest: isDevMode || hasSigningKey,
      canReadInsights: hasApiKey && hasInsightsQuery,
    },
    sandbox,
    // Whether the Sandboxes beat is offered at all, independent of whether
    // the environment is entitled to the beta.
    sandboxEnabled: SANDBOX_ENABLED,
    // Which model actually narrates the run. The booth talk track differs
    // between a real completion and the canned brief, so this must not be
    // inferred from the UI.
    llm: {
      mode: isOpenRouterConfigured() ? "openrouter" : "mock",
      model: isOpenRouterConfigured()
        ? OPENROUTER_MODEL
        : `${currentSupportModel} (mocked)`,
    },
    timeline: getTimelineStoreStats(),
  });
}
