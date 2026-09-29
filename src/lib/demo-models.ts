/**
 * The two models the booth's split test compares, chosen by env.
 *
 *   NEXT_PUBLIC_DEMO_MODEL_CURRENT     the model the agent runs on today
 *                                      (default claude-opus-4.8)
 *   NEXT_PUBLIC_DEMO_MODEL_CHALLENGER  the model the split test challenges it
 *                                      with (default gpt-5.5)
 *
 * NEXT_PUBLIC_ because the browser renders the lane names too; like
 * feature-flags.ts, they are inlined at build time, so redeploy after
 * changing them. This is the only file that reads them.
 *
 * The names are labels: the split test's scores are scripted by ROLE, not by
 * model (see experiment-results.ts), so the challenger always wins whatever
 * the names are.
 */

const DEFAULT_CURRENT = "claude-opus-4.8";
const DEFAULT_CHALLENGER = "gpt-5.5";

// Accessed as literals: Next only inlines NEXT_PUBLIC_ vars written out in
// full, never through a computed key.
const configuredCurrent =
  process.env.NEXT_PUBLIC_DEMO_MODEL_CURRENT?.trim() || DEFAULT_CURRENT;
const configuredChallenger =
  process.env.NEXT_PUBLIC_DEMO_MODEL_CHALLENGER?.trim() || DEFAULT_CHALLENGER;

export const currentModel = configuredCurrent;

/**
 * group.experiment keys variants by name, so two identical names would
 * collapse into one variant and the test could never pick a winner. Fall back
 * to a default that differs rather than breaking the beat on stage.
 */
export const challengerModel =
  configuredChallenger !== configuredCurrent
    ? configuredChallenger
    : configuredCurrent === DEFAULT_CHALLENGER
      ? DEFAULT_CURRENT
      : DEFAULT_CHALLENGER;

if (challengerModel !== configuredChallenger) {
  console.warn(
    `[demo-models] NEXT_PUBLIC_DEMO_MODEL_CHALLENGER matches the current model ("${configuredCurrent}"); using "${challengerModel}" as the challenger.`,
  );
}

export type ModelRole = "current" | "challenger";

/** Anything that is not the challenger, including real OpenRouter ids, is current. */
export function modelRole(model: string): ModelRole {
  return model === challengerModel ? "challenger" : "current";
}

/** Best-effort gen_ai provider for OTel spans, from the model name. */
export function modelProvider(model: string): string {
  const name = model.toLowerCase();

  if (name.includes("claude") || name.startsWith("anthropic/")) return "anthropic";
  if (name.includes("gpt") || /^o\d/.test(name) || name.startsWith("openai/")) return "openai";
  if (name.includes("gemini") || name.startsWith("google/")) return "gcp.gemini";

  return "unknown";
}
