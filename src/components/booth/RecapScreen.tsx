import * as React from "react";
import { Activity, BarChart3, ShieldCheck } from "lucide-react";
import { inngestLinks, recapCopy } from "@/content/booth-copy";
import { primitiveCards } from "@/content/primitives-reference";
import type { Feedback, SplitTest } from "./useAbTest";
import {
  formatSeconds,
  formatUsd,
  formatWinnerDelta,
  type RunTotals,
} from "./run-view";
import { InngestLink } from "./DashboardLink";
import { ScreenFrame } from "./ScreenFrame";

/**
 * The close: the three pillars with this run's actual numbers, the split
 * test's cost delta scaled to a monthly figure, and the QR code. Every number
 * here comes from what happened on the previous screens; nothing is typed in.
 */
export function RecapScreen({
  totals,
  stepCount,
  feedback,
  split,
  qrSvg,
  ctaUrl,
  replayReason,
  traceUrl,
  depth,
}: {
  traceUrl: string | null;
  totals: RunTotals;
  stepCount: number;
  feedback: Feedback | null;
  split: SplitTest;
  qrSvg: string;
  ctaUrl: string;
  replayReason: string | null;
  depth: boolean;
}) {
  const { aggregate } = split;
  const winner = split.status === "complete" ? aggregate.winner : null;
  const winnerRow = aggregate.variants.find((row) => row.variant === winner);
  const loserRow = aggregate.variants.find(
    (row) => row.variant !== winner && row.runs > 0,
  );
  const monthlySaving =
    winnerRow && loserRow && loserRow.costUsd > winnerRow.costUsd
      ? (loserRow.costUsd - winnerRow.costUsd) * recapCopy.roiVolume
      : null;

  const durableStat =
    totals.retries > 0
      ? `${totals.retries} outage, ${totals.replayedSteps} steps not re-run`
      : `${stepCount} steps, each one durable`;
  const observeStat = `${stepCount} steps · ${formatSeconds(totals.durationMs)} · ${formatUsd(totals.costUsd)}`;
  const abStat = winner
    ? `${winner}: ${formatWinnerDelta(aggregate)}`
    : feedback
      ? "Your vote, recorded as a metric"
      : "Ready to split test";

  return (
    <ScreenFrame
      eyebrow={recapCopy.eyebrow}
      headline={recapCopy.headline}
      replayReason={replayReason}
      aside={
        traceUrl || (split.status === "complete" && !split.simulated) ? (
          <div className="flex gap-3">
            {traceUrl ? <InngestLink href={traceUrl} label={inngestLinks.trace} /> : null}
            {split.status === "complete" && !split.simulated ? (
              <InngestLink href={split.experimentUrl} label={inngestLinks.experiment} />
            ) : null}
          </div>
        ) : null
      }
      depth={depth}
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-8">
        <div className={`grid gap-6 ${depth ? "grid-cols-1" : "grid-cols-3"}`}>
          <Pillar
            icon={<ShieldCheck className="size-10" />}
            title={totals.retries > 0 ? recapCopy.pillars.durable : "Durable by default"}
            stat={durableStat}
            compact={depth}
          />
          <Pillar
            icon={<Activity className="size-10" />}
            title={recapCopy.pillars.observe}
            stat={observeStat}
            compact={depth}
          />
          <Pillar
            icon={<BarChart3 className="size-10" />}
            title={recapCopy.pillars.abtest}
            stat={abStat}
            compact={depth}
          />
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-10">
          <div className="grid gap-4">
            {monthlySaving !== null ? (
              <>
                <p
                  className={`display font-semibold leading-[1.15] ${depth ? "text-[32px]" : "text-[44px]"}`}
                >
                  {recapCopy.roiLabel(
                    compactNumber(recapCopy.roiVolume),
                    winner ?? "",
                    `$${Math.round(monthlySaving).toLocaleString("en-US")}`,
                  )}
                </p>
                <p className="mono text-[17px] uppercase text-[var(--muted-copy)]">
                  {recapCopy.roiFootnote}
                </p>
              </>
            ) : null}
            {depth ? (
              <div className="mt-2 grid gap-2">
                <div className="mono text-[18px] uppercase text-[var(--muted-copy)]">
                  {recapCopy.technical}
                </div>
                <div className="flex flex-wrap gap-3">
                  {primitiveCards.map((card) => (
                    <span
                      key={card.id}
                      className="mono border-2 border-[var(--ink)] bg-white px-3 py-1.5 text-[19px]"
                      title={card.tagline}
                    >
                      {card.name} · {card.sdk}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid justify-items-center gap-3">
            <div
              className="booth-qr size-[240px] border-[3px] border-[var(--ink)] bg-white p-3"
              // Generated server-side by the qrcode package from a URL we
              // control (page.tsx); no user input reaches this markup.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="text-center">
              <div className="display text-[26px] font-semibold">{recapCopy.qrLabel}</div>
              <div className="mono text-[16px] text-[var(--muted-copy)]">
                {ctaUrl.replace(/^https?:\/\//, "")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

function Pillar({
  icon,
  title,
  stat,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  stat: string;
  compact: boolean;
}) {
  return (
    <div
      className={`border-[3px] border-[var(--ink)] bg-white ${compact ? "flex items-center gap-5 px-6 py-4" : "grid min-h-[340px] content-between gap-6 p-10"}`}
    >
      <span className="text-[var(--coral)]">{icon}</span>
      <div className="grid gap-3">
        <div className="display text-[40px] font-semibold leading-[1.1]">{title}</div>
        <div
          className={`display font-medium leading-[1.3] ${compact ? "text-[22px]" : "text-[30px]"}`}
        >
          {stat}
        </div>
      </div>
    </div>
  );
}

function compactNumber(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}
