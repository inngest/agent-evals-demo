import { NextResponse } from "next/server";
import { isCloud, DEMO_TARGET } from "@/lib/demo-target";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { getScoreHistory } from "@/lib/scoring";
import { checkSandboxAccess } from "@/lib/sandbox";
import { incidents } from "@/content/incidents";
import { seededExperiment, seededSessions } from "@/content/seed-data";

export async function GET() {
  const history = await getScoreHistory();
  const sandbox = await checkSandboxAccess();
  // The client's actual mode comes from DEMO_TARGET (client.ts: isDev = !isCloud),
  // not from INNGEST_DEV. Report both so a DEMO_TARGET-less production deploy
  // (client silently in dev mode) is visible instead of masked as "cloud".
  const isDevMode = process.env.INNGEST_DEV === "1";
  const clientInDevMode = !isCloud;
  const modeConflict = isCloud && isDevMode;
  const isProductionRuntime = process.env.NODE_ENV === "production";
  const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
  const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY);
  const hasApiKey = Boolean(process.env.INNGEST_API_KEY);
  const hasInsightsQuery = Boolean(process.env.INNGEST_INSIGHTS_SCORE_QUERY);
  const hasInsightsUrl = Boolean(process.env.NEXT_PUBLIC_INNGEST_INSIGHTS_URL);
  const hasSeedToken = Boolean(process.env.DEMO_SEED_TOKEN);
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
      hasSeedToken,
      hasDashboardUrl,
      inngestEnv: process.env.INNGEST_ENV ?? null,
    },
    readiness: {
      canSendCloudEvents: isDevMode || hasEventKey,
      canServeCloudInngest: isDevMode || hasSigningKey,
      canReadInsights: hasApiKey && hasInsightsQuery,
      demoOpsRequireToken: isProductionRuntime,
      demoOpsTokenConfigured: !isProductionRuntime || hasSeedToken,
      seedEndpointProtected: isProductionRuntime,
      incidentCorpusReady: incidents.length === 12,
      sessionsSeeded: seededSessions.length >= 1,
      experimentSeeded: seededExperiment.cells.length > 0,
    },
    sandbox,
    scoreHistory: {
      source: history.source,
      points: history.points.length,
      trendPoints: history.trend.length,
      updatedAt: history.updatedAt,
    },
  });
}
