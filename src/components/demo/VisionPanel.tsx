"use client";

import { BarChart3, ExternalLink, FunctionSquare, SearchCode } from "lucide-react";
import { DashboardLink } from "@/components/demo/DashboardLink";
import { getDeepLink } from "@/lib/inngest-dashboard";

export function VisionPanel() {
  const envUrl = getDeepLink("envDashboard");
  const insightsUrl = getDeepLink("insights");

  return (
    <div className="grid h-full min-h-0 overflow-hidden bg-white xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-[var(--rule-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] p-4">
          <div>
            <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
              <BarChart3 className="size-3.5" />
              Act 4 vision
            </div>
            <div className="display mt-1 text-xl font-medium">
              Runs, scores, sessions, experiments, Insights
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DashboardLink
              href={envUrl}
              className="demo-segment-button mono inline-flex h-8 items-center gap-2 px-3 text-[11px] uppercase"
            >
              <ExternalLink className="size-3.5" />
              Env dashboard
            </DashboardLink>
            <DashboardLink
              href={insightsUrl}
              className="demo-segment-button mono inline-flex h-8 items-center gap-2 px-3 text-[11px] uppercase"
            >
              <SearchCode className="size-3.5" />
              Insights
            </DashboardLink>
          </div>
        </div>

        <div className="grid min-h-0 gap-5 overflow-auto p-5 lg:grid-cols-3">
          <VisionTile
            label="env dashboard"
            value="triage-agent"
            detail="Function runs, retries, step traces, and failures in one place."
          />
          <VisionTile
            label="sessions"
            value="sess-EXE-1737"
            detail="One bug thread can hold repeated investigations and their scores."
          />
          <VisionTile
            label="experiments"
            value="group.experiment"
            detail="Run the same resolved bug corpus across models and compare outcomes."
          />
          <div className="lg:col-span-3 border border-[var(--ink)] bg-[#17131a] p-5 text-[#f2eee8]">
            <div className="mono mb-3 flex items-center gap-2 text-[11px] uppercase text-[var(--coral-soft)]">
              <FunctionSquare className="size-3.5" />
              the scorer is just your function
            </div>
            <pre className="mono overflow-auto text-[13px] leading-7">{`export function localizationScore(cited: string[], truth: string[]) {
  const truthSet = new Set(truth);
  const hits = cited.filter((file) => truthSet.has(file)).length;
  const union = new Set([...cited, ...truth]).size;

  return union === 0 ? 0 : hits / union; // 0..1
}`}</pre>
          </div>
          <div className="lg:col-span-3 border border-[var(--ink)] bg-[var(--bone)] p-5">
            <div className="mono mb-2 text-[11px] uppercase text-[var(--muted-copy)]">
              Insights query
            </div>
            <pre className="mono overflow-auto whitespace-pre-wrap text-xs leading-6">{`SELECT model, AVG(outcome_score) AS accuracy, AVG(latency_ms) AS latency
FROM scores
WHERE experiment_id = 'exp-localization-bakeoff'
GROUP BY model
ORDER BY accuracy DESC;`}</pre>
          </div>
        </div>
      </section>

      <aside className="grid min-h-0 content-start gap-4 overflow-auto bg-[var(--bone)] p-5">
        <div className="display text-lg font-medium">The punchline</div>
        <p className="text-sm leading-6 text-[var(--muted-copy)]">
          Inngest runs the agent, so it already owns the durable facts: model
          turns, tool calls, attempts, scores, sessions, and experiments. The
          scorer can stay as boring as a function that returns 0 to 1.
        </p>
        <div className="grid gap-2 mono text-[11px] uppercase">
          <Row label="live dependency" value="local Inngest" />
          <Row label="LLM" value="mocked" />
          <Row label="tools" value="mocked" />
          <Row label="scores" value="seeded plus live" />
          <Row label="query layer" value="Insights" />
        </div>
      </aside>
    </div>
  );
}

function VisionTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-[var(--ink)] bg-white p-4">
      <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div className="display mt-2 text-2xl font-medium">{value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">{detail}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--rule-soft)] py-2">
      <span>{label}</span>
      <span className="text-[var(--muted-copy)]">{value}</span>
    </div>
  );
}
