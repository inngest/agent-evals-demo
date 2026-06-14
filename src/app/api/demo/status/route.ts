import { NextResponse } from "next/server";
import {
  getInngestDashboardUrl,
  getInngestRunsUrl,
} from "@/lib/inngest-dashboard";
import { getScoreHistory } from "@/lib/scoring";

export async function GET() {
  const history = await getScoreHistory();
  const isDevMode = process.env.INNGEST_DEV === "1";
  const isProductionRuntime = process.env.NODE_ENV === "production";
  const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
  const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY);
  const hasApiKey = Boolean(process.env.INNGEST_API_KEY);
  const hasInsightsQuery = Boolean(process.env.INNGEST_INSIGHTS_SCORE_QUERY);
  const hasSeedToken = Boolean(process.env.DEMO_SEED_TOKEN);
  const dashboardUrl = getInngestDashboardUrl();
  const runsUrl = getInngestRunsUrl();

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
      hasRunsUrl: Boolean(process.env.NEXT_PUBLIC_INNGEST_RUNS_URL),
      inngestEnv: process.env.INNGEST_ENV ?? null,
    },
    readiness: {
      canSendCloudEvents: isDevMode || hasEventKey,
      canServeCloudInngest: isDevMode || hasSigningKey,
      canReadInsights: hasApiKey && hasInsightsQuery,
      demoOpsRequireToken: isProductionRuntime,
      demoOpsTokenConfigured: !isProductionRuntime || hasSeedToken,
      seedEndpointProtected: isProductionRuntime,
      scoreHistoryBackedByInsights: history.source === "inngest-insights",
    },
    scoreHistory: {
      source: history.source,
      points: history.points.length,
      trendPoints: history.trend.length,
      savedCount: history.savedCount,
      discardedCount: history.discardedCount,
      updatedAt: history.updatedAt,
    },
  });
}
