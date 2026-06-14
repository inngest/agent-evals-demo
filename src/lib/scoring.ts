import { seededScoreTrend } from "@/content/seed-data";

export type ScoreSignal = "saved" | "discarded";

export type MockScore = {
  runId: string;
  signal: ScoreSignal;
  score: number;
  label: string;
  trend: number[];
  scoredAt: string;
};

export type ScoreHistoryPoint = {
  runId: string;
  signal: ScoreSignal;
  score: number;
  scoredAt: string;
  source: "seeded" | "live" | "inngest";
};

export type ScoreHistory = {
  points: ScoreHistoryPoint[];
  trend: number[];
  currentScore: number;
  savedCount: number;
  discardedCount: number;
  source: "seeded" | "memory" | "inngest-insights";
  updatedAt: string;
};

type ScoreStoreState = {
  mockScoreStore: Map<string, MockScore>;
  scoreHistoryStore: Map<string, ScoreHistoryPoint>;
};

const globalScoreStore = globalThis as typeof globalThis & {
  __agentEvalsScoreStore?: ScoreStoreState;
};

const scoreStore =
  globalScoreStore.__agentEvalsScoreStore ??
  (globalScoreStore.__agentEvalsScoreStore = {
    mockScoreStore: new Map<string, MockScore>(),
    scoreHistoryStore: new Map<string, ScoreHistoryPoint>(),
  });

const { mockScoreStore, scoreHistoryStore } = scoreStore;
const shouldPersistScoreHistory =
  process.env.NODE_ENV !== "production" || Boolean(process.env.DEMO_SCORE_HISTORY_FILE);
const scoreHistoryFile =
  process.env.DEMO_SCORE_HISTORY_FILE ??
  "/tmp/agent-evals-booth-demo-score-history.json";

// TODO(launch): replace with createDefer + the real scoring primitive when shipped.
export async function scoreSavedQuery(
  runId: string,
  signal: ScoreSignal,
  options: { scoredAt?: string; source?: ScoreHistoryPoint["source"] } = {}
): Promise<MockScore> {
  await loadPersistedScoreHistory();

  const score = signal === "saved" ? 0.92 : 0.34;
  const label =
    signal === "saved" ? "based on: saved to dashboard" : "based on: discarded";
  const scored: MockScore = {
    runId,
    signal,
    score,
    label,
    trend: [...seededScoreTrend, score],
    scoredAt: options.scoredAt ?? new Date().toISOString(),
  };

  mockScoreStore.set(runId, scored);
  scoreHistoryStore.set(runId, {
    runId,
    signal,
    score,
    scoredAt: scored.scoredAt,
    source: options.source ?? "live",
  });
  await persistScoreHistory();

  return scored;
}

export function getMockScore(runId: string) {
  return mockScoreStore.get(runId);
}

export async function resetScoreHistory() {
  mockScoreStore.clear();
  scoreHistoryStore.clear();
  await persistScoreHistory();
}

export async function seedScoreHistory(
  scores: Array<{ runId: string; signal: ScoreSignal; scoredAt: string }>
) {
  for (const score of scores) {
    await scoreSavedQuery(score.runId, score.signal, {
      scoredAt: score.scoredAt,
      source: "seeded",
    });
  }
}

export async function getScoreHistory(): Promise<ScoreHistory> {
  const insightsHistory = await getInngestInsightsScoreHistory();

  if (insightsHistory) {
    return insightsHistory;
  }

  await loadPersistedScoreHistory();

  const points = [...scoreHistoryStore.values()].sort(
    (a, b) =>
      new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime()
  );

  if (points.length === 0) {
    return buildHistory(
      seededScoreTrend.map((score, index) => ({
        runId: `seeded-${index + 1}`,
        signal: "saved",
        score,
        scoredAt: new Date(
          Date.now() - (seededScoreTrend.length - index) * 24 * 60 * 60 * 1000
        ).toISOString(),
        source: "seeded",
      })),
      "seeded"
    );
  }

  return buildHistory(points, "memory");
}

function buildHistory(
  points: ScoreHistoryPoint[],
  source: ScoreHistory["source"]
): ScoreHistory {
  const trend = points.map((point) => point.score);
  const savedCount = points.filter((point) => point.signal === "saved").length;
  const discardedCount = points.filter(
    (point) => point.signal === "discarded"
  ).length;

  return {
    points,
    trend,
    currentScore: trend[trend.length - 1] ?? 0.92,
    savedCount,
    discardedCount,
    source,
    updatedAt: new Date().toISOString(),
  };
}

async function loadPersistedScoreHistory() {
  if (!shouldPersistScoreHistory) {
    return;
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(
      /*turbopackIgnore: true*/ scoreHistoryFile,
      "utf8"
    );
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return;
    }

    scoreHistoryStore.clear();

    for (const item of parsed) {
      const point = toPersistedScoreHistoryPoint(item);

      if (point) {
        scoreHistoryStore.set(point.runId, point);
      }
    }
  } catch {
    // Missing or malformed local history should fall back to the seeded trend.
  }
}

async function persistScoreHistory() {
  if (!shouldPersistScoreHistory) {
    return;
  }

  const points = [...scoreHistoryStore.values()];
  const directory = scoreHistoryFile.slice(0, scoreHistoryFile.lastIndexOf("/"));
  const { mkdir, writeFile } = await import("node:fs/promises");

  if (directory) {
    await mkdir(/*turbopackIgnore: true*/ directory, { recursive: true });
  }

  await writeFile(
    /*turbopackIgnore: true*/ scoreHistoryFile,
    JSON.stringify(points, null, 2)
  );
}

function toPersistedScoreHistoryPoint(value: unknown): ScoreHistoryPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = stringValue(record.runId);
  const scoredAt = stringValue(record.scoredAt);
  const score = Number(record.score);
  const source =
    record.source === "seeded" ||
    record.source === "live" ||
    record.source === "inngest"
      ? record.source
      : null;

  if (!runId || !scoredAt || !Number.isFinite(score) || !source) {
    return null;
  }

  return {
    runId,
    signal: record.signal === "discarded" ? "discarded" : "saved",
    score,
    scoredAt,
    source,
  };
}

async function getInngestInsightsScoreHistory() {
  const query = process.env.INNGEST_INSIGHTS_SCORE_QUERY;
  const token = process.env.INNGEST_API_KEY ?? "";

  if (!query || !token) {
    return null;
  }

  const baseUrl = process.env.INNGEST_API_BASE_URL ?? "https://api.inngest.com";

  try {
    const response = await fetch(new URL("/v2/insights/query", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(process.env.INNGEST_ENV
          ? { "X-Inngest-Env": process.env.INNGEST_ENV }
          : {}),
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as {
      data?: unknown[];
      rows?: unknown[];
      result?: unknown[];
    };
    const rows = body.data ?? body.rows ?? body.result ?? [];
    const points = rows
      .map(toScoreHistoryPoint)
      .filter((point): point is ScoreHistoryPoint => Boolean(point));

    return points.length > 0 ? buildHistory(points, "inngest-insights") : null;
  } catch {
    return null;
  }
}

function toScoreHistoryPoint(row: unknown): ScoreHistoryPoint | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const score = Number(record.score);
  const scoredAt =
    stringValue(record.scoredAt) ??
    stringValue(record.scored_at) ??
    stringValue(record.timestamp) ??
    stringValue(record.ts);

  if (!Number.isFinite(score) || !scoredAt) {
    return null;
  }

  return {
    runId:
      stringValue(record.runId) ??
      stringValue(record.run_id) ??
      stringValue(record.id) ??
      crypto.randomUUID(),
    signal: record.signal === "discarded" ? "discarded" : "saved",
    score,
    scoredAt,
    source: "inngest",
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
