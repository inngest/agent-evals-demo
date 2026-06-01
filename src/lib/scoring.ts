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

const mockScoreStore = new Map<string, MockScore>();

// TODO(launch): replace with real group.defer + scoring primitive when shipped.
export async function scoreSavedQuery(
  runId: string,
  signal: ScoreSignal
): Promise<MockScore> {
  const score = signal === "saved" ? 0.92 : 0.34;
  const label =
    signal === "saved" ? "based on: saved to dashboard" : "based on: discarded";
  const scored: MockScore = {
    runId,
    signal,
    score,
    label,
    trend: [...seededScoreTrend, score],
    scoredAt: new Date().toISOString(),
  };

  mockScoreStore.set(runId, scored);
  return scored;
}

export function getMockScore(runId: string) {
  return mockScoreStore.get(runId);
}
