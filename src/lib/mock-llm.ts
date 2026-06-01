import { RetryAfterError } from "inngest";
import { canonicalSql } from "@/content/seed-data";
import { normalizeDemoFlags, wait, type DemoFlags } from "@/lib/demo-flags";

type GenerateSQLOptions = {
  flags?: Partial<DemoFlags>;
  attempt?: number;
};

export async function generateSQL(
  _prompt: string,
  options: GenerateSQLOptions = {}
) {
  const flags = normalizeDemoFlags(options.flags);
  const attempt = Math.max(0, options.attempt ?? 0);

  await wait(600 + flags.latencyMs);

  if (flags.llmOffline && attempt < flags.failureCount) {
    throw new RetryAfterError("Opus unavailable: 503", "750ms");
  }

  return canonicalSql;
}
