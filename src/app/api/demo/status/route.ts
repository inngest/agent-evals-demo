import { NextResponse } from "next/server";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { getScoreHistory } from "@/lib/scoring";
import { incidents } from "@/content/incidents";
import { seededExperiment, seededSessions } from "@/content/seed-data";

export async function GET() {
  const history = await getScoreHistory();
  const isDevMode = process.env.INNGEST_DEV === "1";
  const isProductionRuntime = process.env.NODE_ENV === "production";
  const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
  const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY);
  const hasApiKey = Boolean(process.env.INNGEST_API_KEY);
  const hasInsightsQuery = Boolean(process.env.INNGEST_INSIGHTS_SCORE_QUERY);
  const hasSeedToken = Boolean(process.env.DEMO_SEED_TOKEN);
  const dashboardUrl = getDeepLink("envDashboard");
  const runsUrl = getDeepLink("runTrace");

  return NextResponse.json({
    ok: true,
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      inngestMode: isDevMode ? "dev" : "cloud",
      dashboardUrl,
      runsUrl,
    },
    configuration: {
      hasEventKey,
      hasSigningKey,
      hasEncryptionKey: Boolean(process.env.INNGEST_ENCRYPTION_KEY),
      hasApiKey,
      hasInsightsQuery,
      hasSeedToken,
      hasDashboardBase: Boolean(process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_BASE),
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
    scoreHistory: {
      source: history.source,
      points: history.points.length,
      trendPoints: history.trend.length,
      updatedAt: history.updatedAt,
    },
  });
}
