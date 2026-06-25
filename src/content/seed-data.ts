import { incidents } from "@/content/incidents";

export type SeededScore = {
  runId: string;
  incidentId: string;
  liveSignal: "up" | "down" | null;
  liveScore: number;
  outcomeScore: number;
  scoredAt: string;
};

export const seededScores: SeededScore[] = incidents.map((incident, index) => {
  const liveSignal = index % 6 === 2 ? "down" : index % 5 === 3 ? null : "up";
  return {
    runId: `seed-run-${incident.id.toLowerCase()}`,
    incidentId: incident.id,
    liveSignal,
    liveScore: liveSignal === "down" ? 0 : liveSignal === "up" ? 1 : 0.5,
    outcomeScore: localizationScore(
      incident.citedFiles,
      incident.groundTruthFixFiles
    ),
    scoredAt: new Date(Date.UTC(2026, 5, 16, 14, index * 7)).toISOString(),
  };
});

export type SeededRun = {
  runId: string;
  attempt: number;
  status: "completed" | "failed" | "retried";
  iterations: number;
  outcomeScore: number;
  startedAt: string;
  durationMs: number;
};

// SESSIONS: FAKED in both local and cloud modes this pass.
// BLOCKED: needs the unified scoring+sessions SDK tag (pr-1547 / base 4.6.1).
// Owner: Jakob. Do NOT wire a real sessions primitive against pr-1521 — it
// does not exist there. Revisit when the unified tag lands.
export type SeededSession = {
  sessionId: string;
  incidentId: string;
  title: string;
  runs: SeededRun[];
  latestOutcomeScore: number;
};

export const seededSessions: SeededSession[] = incidents.map((incident, index) => {
  const baseScore = localizationScore(
    incident.citedFiles,
    incident.groundTruthFixFiles
  );
  const started = Date.UTC(2026, 5, 16, 16, index * 5);
  const runs: SeededRun[] = [
    {
      runId: `sess-${incident.id.toLowerCase()}-a`,
      attempt: 1,
      status: "failed",
      iterations: Math.max(3, incident.toolPlan.length - 2),
      outcomeScore: Math.max(0.2, baseScore - 0.26),
      startedAt: new Date(started).toISOString(),
      durationMs: 2480 + index * 53,
    },
    {
      runId: `sess-${incident.id.toLowerCase()}-b`,
      attempt: 2,
      status: "retried",
      iterations: incident.toolPlan.length,
      outcomeScore: Math.max(0.35, baseScore - 0.1),
      startedAt: new Date(started + 6 * 60 * 1000).toISOString(),
      durationMs: 4200 + index * 71,
    },
    {
      runId: `sess-${incident.id.toLowerCase()}-c`,
      attempt: 3,
      status: "completed",
      iterations: incident.toolPlan.length + 1,
      outcomeScore: baseScore,
      startedAt: new Date(started + 14 * 60 * 1000).toISOString(),
      durationMs: 3600 + index * 61,
    },
  ];

  return {
    sessionId: `sess-${incident.id}`,
    incidentId: incident.id,
    title: incident.title,
    runs,
    latestOutcomeScore: runs[runs.length - 1].outcomeScore,
  };
});

export type ExperimentModel = "gpt-5.5" | "claude-opus-4.8";

export type ExperimentCell = {
  incidentId: string;
  model: ExperimentModel;
  outcomeScore: number;
  latencyMs: number;
  costUsd: number;
};

export type ExperimentAggregate = {
  model: ExperimentModel;
  accuracy: number;
  avgLatencyMs: number;
  avgCostUsd: number;
};

export type SeededExperiment = {
  experimentId: string;
  name: string;
  groupExperimentName: string;
  corpusIncidentIds: string[];
  cells: ExperimentCell[];
  aggregates: ExperimentAggregate[];
};

const corpusIncidentIds = incidents.slice(0, 8).map((incident) => incident.id);

const cells: ExperimentCell[] = corpusIncidentIds.flatMap((incidentId, index) => [
  {
    incidentId,
    model: "gpt-5.5",
    outcomeScore: [0.74, 0.8, 0.68, 0.82, 0.72, 0.78, 0.77, 0.71][index],
    latencyMs: [760, 820, 700, 890, 780, 840, 910, 750][index],
    costUsd: [0.016, 0.019, 0.014, 0.021, 0.017, 0.018, 0.02, 0.015][index],
  },
  {
    incidentId,
    model: "claude-opus-4.8",
    outcomeScore: [0.95, 0.91, 0.88, 0.94, 0.9, 0.93, 0.92, 0.89][index],
    latencyMs: [2100, 2280, 1980, 2350, 2160, 2240, 2380, 2060][index],
    costUsd: [0.072, 0.081, 0.069, 0.086, 0.078, 0.083, 0.088, 0.074][index],
  },
]);

export const seededExperiment: SeededExperiment = {
  experimentId: "exp-localization-bakeoff",
  name: "Resolved code-bug localization bakeoff",
  groupExperimentName: "group.experiment",
  corpusIncidentIds,
  cells,
  aggregates: aggregateExperiment(cells),
};

function aggregateExperiment(cells: ExperimentCell[]): ExperimentAggregate[] {
  const models: ExperimentModel[] = ["gpt-5.5", "claude-opus-4.8"];

  return models.map((model) => {
    const modelCells = cells.filter((cell) => cell.model === model);
    return {
      model,
      accuracy: mean(modelCells.map((cell) => cell.outcomeScore)),
      avgLatencyMs: mean(modelCells.map((cell) => cell.latencyMs)),
      avgCostUsd: mean(modelCells.map((cell) => cell.costUsd)),
    };
  });
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function localizationScore(citedFiles: string[], groundTruthFixFiles: string[]) {
  const cited = new Set(citedFiles.map((file) => file.toLowerCase()));
  const truth = new Set(groundTruthFixFiles.map((file) => file.toLowerCase()));
  const union = new Set([...cited, ...truth]);
  let intersection = 0;

  for (const file of cited) {
    if (truth.has(file)) {
      intersection += 1;
    }
  }

  return union.size === 0 ? 0 : intersection / union.size;
}
