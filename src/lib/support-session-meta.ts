import type { EventMeta } from "inngest";
import { supportSessionId } from "@/content/support-demo";

export const supportSessionKey = "support_session_id";

export function supportSessionMeta(
  sessionId: string = supportSessionId
): EventMeta {
  return {
    sessions: {
      [supportSessionKey]: sessionId,
    },
  };
}
