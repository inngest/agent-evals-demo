/**
 * Localization scoring for the incident-triage demo.
 *
 * The "outcome score" grades the RCA's cited files against the incident's
 * ground-truth fix files using Jaccard overlap:
 *
 *   score = |cited ∩ truth| / |cited ∪ truth|   (clamped 0..1)
 *
 * This is the deferred score. In CLOUD mode the real primitive ships in
 * src/inngest/scorers/localization-scorer.ts (createScorer), deferred from
 * score-incident.ts via the `defer` ctx arg — the scorer body is the same pure
 * localizationScore() below. In LOCAL mode it's computed synchronously inside
 * score-incident.ts via recordOutcomeScore() and written to a small history
 * store so the Scores panel can show a trend.
 *
 * recordOutcomeScore() below is the LOCAL-path implementation — do not delete
 * it. The cloud attachment seam ("write to local history store" →
 * "client.score(...) under the hood") lives in localization-scorer.ts.
 */

export type OutcomeScore = {
  incidentId: string;
  clientRunId: string;
  citedFiles: string[];
  groundTruthFixFiles: string[];
  score: number; // 0..1
  scoredAt: string;
};

export type ScoreHistoryPoint = {
  incidentId: string;
  clientRunId: string;
  score: number;
  scoredAt: string;
  source: "seeded" | "live" | "inngest";
};

export type ScoreHistory = {
  points: ScoreHistoryPoint[];
  trend: number[];
  currentScore: number;
  count: number;
  meanScore: number;
  source: "seeded" | "memory";
  updatedAt: string;
};

/**
 * Pure scorer. Jaccard overlap of cited vs ground-truth fix files, clamped to
 * 0..1. Path comparison is normalized (trimmed, lowercased) so casing or stray
 * whitespace in the corpus doesn't tank a match.
 */
export function localizationScore(
  citedFiles: string[],
  groundTruthFixFiles: string[]
): number {
  const cited = normalizeSet(citedFiles);
  const truth = normalizeSet(groundTruthFixFiles);

  if (cited.size === 0 && truth.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const file of cited) {
    if (truth.has(file)) {
      intersection += 1;
    }
  }

  const union = new Set([...cited, ...truth]).size;
  const score = union === 0 ? 0 : intersection / union;

  return clamp01(score);
}

function normalizeSet(files: string[]): Set<string> {
  return new Set(
    (files ?? [])
      .map((f) => String(f ?? "").trim().toLowerCase())
      .filter((f) => f.length > 0)
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ── score-history store (mirrors the prior global-store + persistence) ──────

type ScoreStoreState = {
  historyStore: Map<string, ScoreHistoryPoint>; // keyed by clientRunId
};

const globalScoreStore = globalThis as typeof globalThis & {
  __incidentTriageScoreStore?: ScoreStoreState;
};

const scoreStore =
  globalScoreStore.__incidentTriageScoreStore ??
  (globalScoreStore.__incidentTriageScoreStore = {
    historyStore: new Map<string, ScoreHistoryPoint>(),
  });

const { historyStore } = scoreStore;

const shouldPersist =
  process.env.NODE_ENV !== "production" ||
  Boolean(process.env.DEMO_SCORE_HISTORY_FILE);
const scoreHistoryFile =
  process.env.DEMO_SCORE_HISTORY_FILE ??
  "/tmp/incident-triage-booth-demo-score-history.json";

/**
 * The LOCAL-path deferred-scoring seam. Computes the localization score and
 * writes it to the local history store so the UI has a trend to render.
 *
 * In CLOUD mode this is bypassed: score-incident.ts defers the real
 * createScorer (src/inngest/scorers/localization-scorer.ts) instead, which
 * forwards the ScorerResult to client.score(...) under the hood. Both compute
 * the identical localizationScore() value.
 */
export async function recordOutcomeScore(
  incidentId: string,
  clientRunId: string,
  citedFiles: string[],
  groundTruthFixFiles: string[],
  options: { scoredAt?: string; source?: ScoreHistoryPoint["source"] } = {}
): Promise<OutcomeScore> {
  await loadPersistedScoreHistory();

  const score = localizationScore(citedFiles, groundTruthFixFiles);
  const scoredAt = options.scoredAt ?? new Date().toISOString();

  const outcome: OutcomeScore = {
    incidentId,
    clientRunId,
    citedFiles,
    groundTruthFixFiles,
    score,
    scoredAt,
  };

  historyStore.set(clientRunId, {
    incidentId,
    clientRunId,
    score,
    scoredAt,
    source: options.source ?? "live",
  });
  await persistScoreHistory();

  return outcome;
}

export async function resetScoreHistory(): Promise<void> {
  historyStore.clear();
  await persistScoreHistory();
}

/**
 * Seed history points (used by the seed script / demo seed endpoint). Each
 * entry supplies an explicit score so the seeded trend is deterministic.
 */
export async function seedScoreHistory(
  scores: Array<{
    incidentId: string;
    clientRunId: string;
    score: number;
    scoredAt: string;
  }>
): Promise<void> {
  await loadPersistedScoreHistory();
  for (const s of scores) {
    historyStore.set(s.clientRunId, {
      incidentId: s.incidentId,
      clientRunId: s.clientRunId,
      score: clamp01(s.score),
      scoredAt: s.scoredAt,
      source: "seeded",
    });
  }
  await persistScoreHistory();
}

export async function getScoreHistory(): Promise<ScoreHistory> {
  await loadPersistedScoreHistory();

  const points = [...historyStore.values()].sort(
    (a, b) => new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime()
  );

  if (points.length === 0) {
    return buildHistory(fallbackSeedPoints, "seeded");
  }

  return buildHistory(points, "memory");
}

const fallbackSeedPoints: ScoreHistoryPoint[] = [
  ["EXE-1737", 1],
  ["EXE-1811", 1],
  ["EXE-1842", 0.5],
  ["EXE-1904", 1],
  ["EXE-1938", 0.5],
  ["EXE-2016", 1],
  ["EXE-2069", 1],
  ["EXE-2110", 0.5],
  ["EXE-2185", 1],
  ["EXE-2244", 0.5],
  ["EXE-2301", 1],
  ["EXE-2377", 1],
].map(([incidentId, score], index) => ({
  incidentId: String(incidentId),
  clientRunId: `seed-score-${String(incidentId).toLowerCase()}`,
  score: Number(score),
  scoredAt: new Date(Date.UTC(2026, 5, 16, 13, index * 6)).toISOString(),
  source: "seeded" as const,
}));

function buildHistory(
  points: ScoreHistoryPoint[],
  source: ScoreHistory["source"]
): ScoreHistory {
  const trend = points.map((p) => p.score);
  const sum = trend.reduce((acc, n) => acc + n, 0);

  return {
    points,
    trend,
    currentScore: trend[trend.length - 1] ?? 0,
    count: points.length,
    meanScore: trend.length === 0 ? 0 : sum / trend.length,
    source,
    updatedAt: new Date().toISOString(),
  };
}

async function loadPersistedScoreHistory(): Promise<void> {
  if (!shouldPersist) {
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

    historyStore.clear();

    for (const item of parsed) {
      const point = toPersistedPoint(item);
      if (point) {
        historyStore.set(point.clientRunId, point);
      }
    }
  } catch {
    // Missing or malformed local history → empty store, falls back to seeded.
  }
}

async function persistScoreHistory(): Promise<void> {
  if (!shouldPersist) {
    return;
  }

  const points = [...historyStore.values()];
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

function toPersistedPoint(value: unknown): ScoreHistoryPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const clientRunId = stringValue(record.clientRunId);
  const incidentId = stringValue(record.incidentId);
  const scoredAt = stringValue(record.scoredAt);
  const score = Number(record.score);
  const source =
    record.source === "seeded" ||
    record.source === "live" ||
    record.source === "inngest"
      ? record.source
      : null;

  if (
    !clientRunId ||
    !incidentId ||
    !scoredAt ||
    !Number.isFinite(score) ||
    !source
  ) {
    return null;
  }

  return {
    clientRunId,
    incidentId,
    score: clamp01(score),
    scoredAt,
    source,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
