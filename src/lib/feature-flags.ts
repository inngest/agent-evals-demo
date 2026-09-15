/**
 * Build-time feature flags for the booth demo.
 *
 * Read in exactly one place so a flag cannot mean one thing on the client and
 * another on the server. NEXT_PUBLIC_ is deliberate: these are inlined into the
 * client bundle at build time AND readable server-side, which keeps the UI and
 * the Inngest function on a single definition. Nothing secret belongs here.
 */

/**
 * Sandboxes (beta) are OFF by default.
 *
 * The beta is access-gated per environment, so an un-entitled deploy shows a
 * "simulated" beat that has to be explained mid-demo. Turning it on is a
 * deliberate choice for an environment where the entitlement is confirmed.
 *
 * Set NEXT_PUBLIC_DEMO_SANDBOX=1 to enable. Any other value, or unset, is off.
 */
export const SANDBOX_ENABLED = process.env.NEXT_PUBLIC_DEMO_SANDBOX === "1";
