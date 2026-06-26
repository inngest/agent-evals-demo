import {
  defaultResearchModel,
  defaultResearchTopic,
  type ResearchModel,
} from "@/content/research-demo";
import {
  inngest,
  researchRunRequested,
  type ResearchFeedbackSignal,
} from "@/inngest/client";
import { researchSessionMeta } from "@/lib/research-session-meta";

const SCORE_HEARTBEAT_CRON = "*/5 * * * *";
const SCORE_HEARTBEAT_SESSION_ID = "sess-research-score-heartbeat";
export const researchScoreHeartbeat = inngest.createFunction(
  {
    id: "research-agent-score-heartbeat",
    name: "Research agent score heartbeat",
    retries: 2,
    triggers: [{ cron: SCORE_HEARTBEAT_CRON }],
  },
  async ({ event, step }) => {
    const scheduledAt = getScheduledAt(event);
    const windowId = toFiveMinuteWindowId(scheduledAt);
    const feedbackSignal = pickFeedbackSignal(windowId);
    const model = pickModel(windowId);
    const qualityScore = pickQualityScore(windowId, model, feedbackSignal);
    const researchRunId = `score-heartbeat-${windowId}`;

    await step.sendEvent(
      "request-research-score-heartbeat-run",
      researchRunRequested.create(
        {
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
        },
        {
          id: `score-heartbeat:${windowId}`,
          ts: scheduledAt.getTime(),
          meta: researchSessionMeta(SCORE_HEARTBEAT_SESSION_ID),
        }
      )
    );

    return {
      researchRunId,
      model,
      qualityScore,
      feedbackSignal,
      scheduledAt: scheduledAt.toISOString(),
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

function toFiveMinuteWindowId(date: Date): string {
  const windowMs = 5 * 60 * 1000;
  const windowStart = Math.floor(date.getTime() / windowMs) * windowMs;

  return new Date(windowStart).toISOString().replace(/[-:.]/g, "");
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
