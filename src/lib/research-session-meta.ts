import type { EventMeta } from "inngest";
import { researchSessionId } from "@/content/research-demo";

export const researchSessionKey = "research_session_id";

export function researchSessionMeta(
  sessionId: string = researchSessionId
): EventMeta {
  return {
    sessions: {
      [researchSessionKey]: sessionId,
    },
  };
}
