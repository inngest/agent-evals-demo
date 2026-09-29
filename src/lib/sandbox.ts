// Seam between the booth demo and Inngest Sandboxes (beta).
//
// Cloud mode runs the REAL durable sandbox steps: create, fetch the
// customer's untrusted link with curl, destroy. Local mode (dev server,
// offline booth fallback) runs a deterministic simulated result inside a
// normal step.run so the local trace still shows the beat. The faked path is
// always the fallback, matching the repo-wide DEMO_TARGET pattern.
//
// Sandbox API requires inngest >= 4.20.0 and sandboxMiddleware() on the
// client (registered unconditionally in src/inngest/client.ts).

import type { GetStepTools } from "inngest";
import { inngest } from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";
import {
  linkCheckScript,
  parseLinkCheckStdout,
  simulatedLinkCheck,
  type LinkCheck,
} from "@/content/link-sandbox";

export type { LinkCheck } from "@/content/link-sandbox";

export type SandboxRunMode = "sandbox" | "simulated";

export type SandboxLinkCheckResult = {
  mode: SandboxRunMode;
  sandboxId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  /** Null when the fetch failed: the link stays unverified. */
  check: LinkCheck | null;
};

export function sandboxNameForRun(supportRunId: string): string {
  return `link-${supportRunId}`;
}

// One captured command: write the script via a heredoc, then run it on the
// link. File upload is direct-client only, so durable steps embed it inline.
export function buildLinkCheckCommand(url: string): string {
  return [
    "cat > /tmp/check.sh <<'SH'",
    linkCheckScript.trimEnd(),
    "SH",
    `sh /tmp/check.sh ${shellQuote(url)}`,
  ].join("\n");
}

// The full step tools for our client, including the step.sandbox surface
// enabled by sandboxMiddleware(). Using the SDK's own type avoids drift.
type SandboxStepContext = GetStepTools<typeof inngest>;

// The one entry point the support agent calls. Cloud runs real durable
// sandbox steps; local simulates inside a normal step so the trace keeps the
// beat. Sandbox destroy stays on the success path as a normal step, per beta
// guidance; leaked-sandbox cleanup lives in the function's onFailure handler.
export async function runSandboxLinkCheck(args: {
  step: SandboxStepContext;
  supportRunId: string;
  url: string;
}): Promise<SandboxLinkCheckResult> {
  const name = sandboxNameForRun(args.supportRunId);

  if (isCloud) {
    const sandbox = await args.step.sandbox.create("create-link-sandbox", {
      name,
      vcpu: 1,
      memoryMb: 1024,
      runningTimeout: "60s",
    });

    const result = await sandbox.commands.run(
      "inspect-link",
      buildLinkCheckCommand(args.url),
      { cwd: "/tmp", timeout: "20s" }
    );

    await sandbox.destroy("destroy-link-sandbox");

    // No fallback: a link the sandbox could not fetch is reported as
    // unverified, never filled in with a guess. The trace shows the exit.
    return {
      mode: "sandbox",
      sandboxId: sandbox.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.output.truncated,
      check:
        result.exitCode === 0
          ? parseLinkCheckStdout(result.stdout, args.url)
          : null,
    };
  }

  return args.step.run("inspect-link", async () => {
    await sleep(650);
    const check = simulatedLinkCheck(args.url);

    return {
      mode: "simulated",
      sandboxId: `sbx-simulated-${args.supportRunId.slice(0, 8)}`,
      exitCode: 0,
      stdout: `${JSON.stringify(check)}\n`,
      stderr: "",
      truncated: false,
      check,
    } satisfies SandboxLinkCheckResult;
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Best-effort cleanup for the agent's onFailure handler: find any sandbox
// named for this run and destroy it. Cloud-only; no-ops locally.
export async function destroySandboxesNamed(name: string): Promise<number> {
  if (!isCloud) return 0;

  try {
    const list = await inngest.sandboxes.list({ limit: 100 });
    const matches = list.items.filter(
      (item) => item.name === name || item.id === name
    );
    let destroyed = 0;

    for (const match of matches) {
      try {
        const sandbox = await inngest.sandboxes.get(match.id);
        await sandbox?.destroy();
        destroyed += 1;
      } catch {
        // Best effort only.
      }
    }

    return destroyed;
  } catch {
    return 0;
  }
}

export type SandboxAccess = {
  mode: SandboxRunMode;
  reason: string;
  checkedAt: string;
};

const globalSandboxAccess = globalThis as typeof globalThis & {
  __sandboxAccess?: { value: SandboxAccess; expiresAt: number };
};

/**
 * Ceiling on the entitlement probe. The Inngest client has no timeout of its
 * own, so without this a stalled uplink hangs every caller of
 * checkSandboxAccess - including /api/demo/status, which the preflight and
 * the booth read before the doors open. Failing
 * closed to "simulated" after a short wait is always better than hanging.
 */
const SANDBOX_PROBE_TIMEOUT_MS = 2500;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Entitlement probe for the UI toggle: is the beta enabled for this env?
// Cached for 60s so status polls stay cheap.
export async function checkSandboxAccess(): Promise<SandboxAccess> {
  const cached = globalSandboxAccess.__sandboxAccess;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await probeSandboxAccess();
  globalSandboxAccess.__sandboxAccess = {
    value,
    expiresAt: Date.now() + 60_000,
  };

  return value;
}

async function probeSandboxAccess(): Promise<SandboxAccess> {
  if (!isCloud) {
    return {
      mode: "simulated",
      reason: "Sandboxes are cloud-only; local dev server runs the simulated beat",
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    await withTimeout(
      inngest.sandboxes.list({ limit: 1 }),
      SANDBOX_PROBE_TIMEOUT_MS,
      "Sandbox entitlement probe timed out",
    );

    return {
      mode: "sandbox",
      reason: "Sandbox beta enabled for this environment",
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      mode: "simulated",
      reason:
        error instanceof Error
          ? `Sandbox beta unavailable (${error.message}); simulated beat will run`
          : "Sandbox beta unavailable; simulated beat will run",
      checkedAt: new Date().toISOString(),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
