import type { TriageResult } from "@/components/demo/types";
import type { Incident } from "@/content/incidents";

export function buildTriageResult(
  incident: Incident,
  clientRunId: string
): TriageResult {
  return {
    incidentId: incident.id,
    clientRunId,
    rca: incident.rca,
    citedFiles: incident.citedFiles,
    iterations: incident.toolPlan.length + 1,
    toolCalls: incident.toolPlan.map((step) => step.tool),
    localizationScore: localizationScore(
      incident.citedFiles,
      incident.groundTruthFixFiles
    ),
  };
}

function localizationScore(
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
  return union === 0 ? 0 : intersection / union;
}

function normalizeSet(files: string[]): Set<string> {
  return new Set(
    files
      .map((file) => String(file ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
}
