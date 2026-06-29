import {
  defaultResearchModel,
  defaultResearchTopic,
  type ResearchModel,
} from "@/content/research-demo";
import {
  inngest,
  type ResearchFeedbackSignal,
  type ResearchRunRequestedData,
} from "@/inngest/client";
import { researchAgent } from "@/inngest/functions/research-agent";

const SCORE_HEARTBEAT_CRON = "* * * * *";
const HEARTBEAT_INTERVAL_SECONDS = 15;
const HEARTBEAT_SLOTS_PER_CRON = 4;

export const researchScoreHeartbeat = inngest.createFunction(
  {
    id: "research-agent-score-heartbeat",
    name: "Research agent score heartbeat",
    retries: 2,
    triggers: [{ cron: SCORE_HEARTBEAT_CRON }],
  },
  async ({ event, step }) => {
    const scheduledAt = getScheduledAt(event);
    const minuteStart = toMinuteStart(scheduledAt);
    const invocations = [];

    // Keep these sequential: parallel sleeps resume together at the final slot.
    for (let slot = 0; slot < HEARTBEAT_SLOTS_PER_CRON; slot += 1) {
      const slotAt = new Date(
        minuteStart.getTime() + slot * HEARTBEAT_INTERVAL_SECONDS * 1000
      );

      await step.sleepUntil(`wait-for-heartbeat-slot-${slot}`, slotAt);

      const {
        feedbackSignal,
        model,
        qualityScore,
        researchRunData,
        researchRunId,
      } = buildResearchRunData(slotAt);

      const agentResult = await step.invoke(
        `invoke-research-agent-heartbeat-${slot}`,
        {
          function: researchAgent,
          data: researchRunData,
        }
      );

      invocations.push({
        researchRunId,
        agentRunId: agentResult.parentRunId,
        model,
        qualityScore,
        feedbackSignal,
        scheduledAt: slotAt.toISOString(),
      });
    }

    return {
      scheduledAt: scheduledAt.toISOString(),
      intervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      invocations,
    };
  }
);

function getScheduledAt(event: { ts?: number | string }): Date {
  const ts = Number(event.ts);

  if (Number.isFinite(ts) && ts > 0) {
    return new Date(ts);
  }

  return new Date();
}

function toMinuteStart(date: Date): Date {
  const minuteMs = 60 * 1000;
  const minuteStart = Math.floor(date.getTime() / minuteMs) * minuteMs;

  return new Date(minuteStart);
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function buildResearchRunData(scheduledAt: Date): {
  feedbackSignal: ResearchFeedbackSignal;
  model: ResearchModel;
  qualityScore: number;
  researchRunData: ResearchRunRequestedData;
  researchRunId: string;
} {
  const slotId = compactTimestamp(scheduledAt);
  const feedbackSignal = pickFeedbackSignal(slotId);
  const model = pickModel(slotId);
  const qualityScore = pickQualityScore(slotId, model, feedbackSignal);
  const researchRunId = `score-heartbeat-${slotId}`;
  const researchRunData: ResearchRunRequestedData = {
    researchRunId,
    topic: defaultResearchTopic,
    cadence: "score-heartbeat-cron",
    model,
    failureStep: "none",
    latencyMs: 0,
    seededQualityScore: qualityScore,
    seededFeedbackSignal: feedbackSignal,
    seededFeedbackAt: scheduledAt.toISOString(),
    requestedAt: scheduledAt.toISOString(),
    source: "booth-demo",
  };

  return {
    feedbackSignal,
    model,
    qualityScore,
    researchRunData,
    researchRunId,
  };
}

function pickFeedbackSignal(windowId: string): ResearchFeedbackSignal {
  const sample = hashUnit(`${windowId}:feedback`);

  if (sample < 0.24) {
    return "missed-context";
  }

  return hashUnit(`${windowId}:positive-kind`) < 0.28 ? "saved" : "useful";
}

function pickModel(windowId: string): ResearchModel {
  return hashUnit(`${windowId}:model`) < 0.62
    ? defaultResearchModel
    : "claude-opus-4.8";
}

function pickQualityScore(
  windowId: string,
  model: ResearchModel,
  feedbackSignal: ResearchFeedbackSignal
): number {
  const base = model === "gpt-5.5" ? 0.9 : 0.84;
  const jitter = (hashUnit(`${windowId}:quality`) - 0.5) * 0.11;
  const feedbackAdjustment =
    feedbackSignal === "missed-context"
      ? -0.1 - hashUnit(`${windowId}:quality-dip`) * 0.08
      : feedbackSignal === "saved"
        ? hashUnit(`${windowId}:quality-lift`) * 0.04
        : 0;

  return round(clamp01(base + jitter + feedbackAdjustment), 3);
}

function hashUnit(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967296;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(1, value));
}
