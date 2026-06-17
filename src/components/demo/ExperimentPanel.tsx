"use client";

import * as React from "react";
import { ExternalLink, FlaskConical, Trophy } from "lucide-react";
import { DashboardLink } from "@/components/demo/DashboardLink";
import { seededExperiment, type ExperimentAggregate } from "@/content/seed-data";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { Slider } from "@/components/ui/slider";
import { SubstrateCallout } from "@/components/demo/SubstrateCallout";

export function ExperimentPanel() {
  const [accuracyWeight, setAccuracyWeight] = React.useState(90);
  const [latencyWeight, setLatencyWeight] = React.useState(5);
  const [costWeight, setCostWeight] = React.useState(5);
  const scored = rankModels(seededExperiment.aggregates, {
    accuracy: accuracyWeight,
    latency: latencyWeight,
    cost: costWeight,
  });
  const winner = scored[0];
  const experimentUrl = getDeepLink("experiment", {
    experimentId: seededExperiment.experimentId,
  });

  return (
    <div className="grid h-full min-h-0 overflow-hidden bg-white xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-[var(--rule-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] p-4">
          <div>
            <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
              <FlaskConical className="size-3.5" />
              {seededExperiment.groupExperimentName}
            </div>
            <div className="display mt-1 text-xl font-medium">
              GPT-5.5 vs Claude on resolved code bugs
            </div>
          </div>
          <DashboardLink
            href={experimentUrl}
            className="demo-segment-button mono inline-flex h-8 items-center gap-2 px-3 text-[11px] uppercase"
          >
            <ExternalLink className="size-3.5" />
            Open experiment
          </DashboardLink>
        </div>

        <div className="grid min-h-0 gap-5 overflow-auto p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <div className="border border-[var(--ink)] bg-[var(--bone)] p-4">
              <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
                <Trophy className="size-3.5" />
                current winner
              </div>
              <div className="display mt-2 text-4xl font-medium">
                {winner.model}
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">
                Score {winner.weighted.toFixed(3)} with your current tradeoff.
              </p>
            </div>

            <div className="grid gap-5 border border-[var(--ink)] bg-white p-4">
              <Slider
                min={0}
                max={100}
                step={1}
                value={accuracyWeight}
                onInput={(event) => setAccuracyWeight(Number(event.currentTarget.value))}
                onChange={(event) => setAccuracyWeight(Number(event.currentTarget.value))}
                label="accuracy"
                valueLabel={`${accuracyWeight}%`}
              />
              <Slider
                min={0}
                max={100}
                step={1}
                value={latencyWeight}
                onInput={(event) => setLatencyWeight(Number(event.currentTarget.value))}
                onChange={(event) => setLatencyWeight(Number(event.currentTarget.value))}
                label="latency"
                valueLabel={`${latencyWeight}%`}
              />
              <Slider
                min={0}
                max={100}
                step={1}
                value={costWeight}
                onInput={(event) => setCostWeight(Number(event.currentTarget.value))}
                onChange={(event) => setCostWeight(Number(event.currentTarget.value))}
                label="cost"
                valueLabel={`${costWeight}%`}
              />
            </div>
            <SubstrateCallout variant="reinforce" />
          </div>

          <div className="grid min-h-0 content-start gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              {scored.map((model) => (
                <div
                  key={model.model}
                  className={`border p-4 ${
                    model.model === winner.model
                      ? "border-[var(--ink)] bg-[var(--bone)]"
                      : "border-[var(--rule-soft)] bg-white"
                  }`}
                >
                  <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
                    {model.model}
                  </div>
                  <div className="display mt-2 text-3xl font-medium tabnum">
                    {model.weighted.toFixed(3)}
                  </div>
                  <dl className="mt-4 grid gap-2 mono text-[11px] uppercase">
                    <Metric label="accuracy" value={model.accuracy.toFixed(2)} />
                    <Metric
                      label="latency"
                      value={`${Math.round(model.avgLatencyMs)}ms`}
                    />
                    <Metric
                      label="cost"
                      value={`$${model.avgCostUsd.toFixed(3)}`}
                    />
                  </dl>
                </div>
              ))}
            </div>

            <div className="min-h-0 overflow-auto border border-[var(--ink)]">
              <div className="grid grid-cols-[1fr_110px_110px_110px] bg-[var(--ink)] px-3 py-2 mono text-[11px] uppercase text-white">
                <span>bug</span>
                <span>model</span>
                <span>score</span>
                <span>latency</span>
              </div>
              {seededExperiment.cells.map((cell) => (
                <div
                  key={`${cell.incidentId}-${cell.model}`}
                  className="grid grid-cols-[1fr_110px_110px_110px] border-t border-[var(--rule-soft)] px-3 py-2 mono text-[11px]"
                >
                  <span>{cell.incidentId}</span>
                  <span>{cell.model === "gpt-5.5" ? "GPT-5.5" : "Claude"}</span>
                  <span className="tabnum">{cell.outcomeScore.toFixed(2)}</span>
                  <span className="tabnum">{cell.latencyMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="grid min-h-0 content-start gap-4 overflow-auto bg-[var(--bone)] p-5">
        <div className="display text-lg font-medium">Why the winner flips</div>
        <p className="text-sm leading-6 text-[var(--muted-copy)]">
          Claude starts with higher localization accuracy. GPT-5.5 is faster and
          cheaper. Push accuracy high and Claude wins. Push latency or cost high
          and GPT-5.5 takes it.
        </p>
        <div className="grid gap-2">
          {scored.map((model) => (
            <div key={model.model} className="grid gap-1">
              <div className="mono flex items-center justify-between text-[11px] uppercase">
                <span>{model.model}</span>
                <span>{Math.round(model.weighted * 100)} pts</span>
              </div>
              <div className="h-8 border border-[var(--ink)] bg-white">
                <div
                  className="h-full bg-[var(--coral)]"
                  style={{ width: `${Math.max(4, model.weighted * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-1">
      <dt>{label}</dt>
      <dd className="tabnum text-[var(--muted-copy)]">{value}</dd>
    </div>
  );
}

function rankModels(
  aggregates: ExperimentAggregate[],
  weights: { accuracy: number; latency: number; cost: number }
) {
  const total = Math.max(weights.accuracy + weights.latency + weights.cost, 1);
  const wAcc = weights.accuracy / total;
  const wLat = weights.latency / total;
  const wCost = weights.cost / total;
  const latencies = aggregates.map((item) => item.avgLatencyMs);
  const costs = aggregates.map((item) => item.avgCostUsd);
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);

  return aggregates
    .map((aggregate) => {
      const latencyScore =
        1 - normalize(aggregate.avgLatencyMs, minLatency, maxLatency);
      const costScore = 1 - normalize(aggregate.avgCostUsd, minCost, maxCost);
      const weighted =
        wAcc * aggregate.accuracy + wLat * latencyScore + wCost * costScore;

      return { ...aggregate, weighted };
    })
    .sort((a, b) => b.weighted - a.weighted);
}

function normalize(value: number, min: number, max: number) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}
