/**
 * Localization scoring for the incident-triage demo.
 *
 * The "outcome score" grades the RCA's cited files against the incident's
 * ground-truth fix files using Jaccard overlap:
 *
 *   score = |cited ∩ truth| / |cited ∪ truth|   (clamped 0..1)
 *
 * This is the deferred score: in production it would be the value returned by
 * a real createDefer/defer scorer attached to the run. Here it is computed
 * synchronously inside score-incident.ts and recorded into a small history
 * store so the Scores panel can show a trend.
 *
 * TODO(launch): swap the recordOutcomeScore() seam below for the real
 * createDefer + defer() primitive when shipped — the scorer body (compute
 * localizationScore) stays identical; only the recording/attachment seam
 * changes from "write to local history store" to "defer().resolve(score)".
 */

export type ScoreSignal = "saved" | "discarded";

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
 * The deferred-scoring seam. Computes the localization score and records it.
 *
 * TODO(launch): replace the body below with the real createDefer/defer
 * primitive. The shape is:
 *
 *   const deferred = createDefer<number>();
 *   // ... attach to the run ...
 *   deferred.resolve(localizationScore(citedFiles, groundTruthFixFiles));
 *
 * Until that ships, we compute synchronously and write to the local history
 * store so the UI has a trend to render.
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
    return {
      points: [],
      trend: [],
      currentScore: 0,
      count: 0,
      meanScore: 0,
      source: "seeded",
      updatedAt: new Date().toISOString(),
    };
  }

  return buildHistory(points, "memory");
}

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
