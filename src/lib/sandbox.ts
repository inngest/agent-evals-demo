// Seam between the booth demo and Inngest Sandboxes (beta).
//
// Cloud mode runs the REAL durable sandbox steps: create, run the
// model-generated analysis script, destroy. Local mode (dev server, offline
// booth fallback) runs a deterministic simulated result inside a normal
// step.run so the local trace still shows the beat. The faked path is always
// the fallback, matching the repo-wide DEMO_TARGET pattern.
//
// Sandbox API requires inngest >= 4.20.0 and sandboxMiddleware() on the
// client (registered unconditionally in src/inngest/client.ts).

import type { GetStepTools } from "inngest";
import { inngest } from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";

export type SandboxRunMode = "sandbox" | "simulated";

export type ChangelogEntry = {
  competitor: string;
  title: string;
  recent: boolean;
  themes: string[];
};

export type ChangelogAnalysis = {
  total_launches: number;
  competitors: Array<{ name: string; launches: number; momentum: number }>;
  top_themes: string[];
};

export type SandboxAnalysisResult = {
  mode: SandboxRunMode;
  sandboxId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  analysis: ChangelogAnalysis;
};

// The changelog corpus the (mocked) competitor API step returned. The
// generated script runs against this JSON deterministically.
export const changelogCorpus: ChangelogEntry[] = [
  {
    competitor: "Temporal",
    title: "Durable timers GA",
    recent: false,
    themes: ["durable-execution"],
  },
  {
    competitor: "Temporal",
    title: "Workflow update patches",
    recent: true,
    themes: ["workflows"],
  },
  {
    competitor: "Braintrust",
    title: "Online evals dashboard",
    recent: true,
    themes: ["evals"],
  },
  {
    competitor: "Braintrust",
    title: "Experiment auto-routing",
    recent: true,
    themes: ["evals", "experiments"],
  },
  {
    competitor: "Braintrust",
    title: "Log import connectors",
    recent: false,
    themes: ["experiments"],
  },
  {
    competitor: "BullMQ",
    title: "Rate limiting improvements",
    recent: false,
    themes: ["queues"],
  },
  {
    competitor: "BullMQ",
    title: "Flow control primitives",
    recent: true,
    themes: ["queues", "retries"],
  },
];

// The "model-generated" script: a stage prop, deterministic, never runs in
// the app process. In cloud mode it executes inside a real sandbox.
const generatedAnalysisScript = `#!/usr/bin/env python3
"""Score competitor launch momentum from raw changelog entries."""
import json, sys
from collections import Counter

with open(sys.argv[1]) as f:
    entries = json.load(f)

by_competitor = Counter(e["competitor"] for e in entries)
recent = Counter(e["competitor"] for e in entries if e.get("recent"))
themes = Counter(t for e in entries for t in e.get("themes", []))

analysis = {
    "total_launches": sum(by_competitor.values()),
    "competitors": [
        {
            "name": name,
            "launches": launches,
            "momentum": round(min(1.0, (launches + 2 * recent[name]) / 10), 2),
        }
        for name, launches in sorted(by_competitor.items())
    ],
    "top_themes": [t for t, _ in themes.most_common(3)],
}
print(json.dumps(analysis))
`;

export function sandboxNameForRun(researchRunId: string): string {
  return `research-${researchRunId}`;
}

// One captured command: write the script + input via heredocs, then run it.
// File upload is direct-client only, so durable steps embed both inline.
export function buildAnalysisCommand(): string {
  return [
    "cat > /tmp/analyze.py <<'PY'",
    generatedAnalysisScript.trimEnd(),
    "PY",
    "cat > /tmp/changelog.json <<'JSON'",
    JSON.stringify(changelogCorpus),
    "JSON",
    "python3 /tmp/analyze.py /tmp/changelog.json",
  ].join("\n");
}

// JS mirror of the generated script. Used for the simulated local result so
// the shape always matches what the real sandbox would print.
function analyzeChangelogLocal(entries: ChangelogEntry[]): ChangelogAnalysis {
  const byCompetitor = new Map<string, number>();
  const recent = new Map<string, number>();
  const themes = new Map<string, number>();

  for (const entry of entries) {
    byCompetitor.set(
      entry.competitor,
      (byCompetitor.get(entry.competitor) ?? 0) + 1,
    );
    if (entry.recent) {
      recent.set(entry.competitor, (recent.get(entry.competitor) ?? 0) + 1);
    }
    for (const theme of entry.themes) {
      themes.set(theme, (themes.get(theme) ?? 0) + 1);
    }
  }

  return {
    total_launches: entries.length,
    competitors: [...byCompetitor.entries()]
      .map(([name, launches]) => ({
        name,
        launches,
        momentum: round2(Math.min(1, (launches + 2 * (recent.get(name) ?? 0)) / 10)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    top_themes: [...themes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme]) => theme),
  };
}

export function parseAnalysisStdout(stdout: string): ChangelogAnalysis | null {
  try {
    const parsed = JSON.parse(stdout) as ChangelogAnalysis;

    if (
      typeof parsed.total_launches === "number" &&
      Array.isArray(parsed.competitors) &&
      Array.isArray(parsed.top_themes)
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

// The full step tools for our client, including the step.sandbox surface
// enabled by sandboxMiddleware(). Using the SDK's own type avoids drift.
type SandboxStepContext = GetStepTools<typeof inngest>;

// The one entry point the research agent calls. Cloud runs real durable
// sandbox steps; local simulates inside a normal step so the trace keeps the
// beat. Sandbox destroy stays on the success path as a normal step, per beta
// guidance; leaked-sandbox cleanup lives in the function's onFailure handler.
export async function runSandboxAnalysis(args: {
  step: SandboxStepContext;
  researchRunId: string;
}): Promise<SandboxAnalysisResult> {
  const name = sandboxNameForRun(args.researchRunId);

  if (isCloud) {
    const sandbox = await args.step.sandbox.create("create-analysis-sandbox", {
      name,
      vcpu: 1,
      memoryMb: 1024,
      runningTimeout: "60s",
    });

    const result = await sandbox.commands.run(
      "run-generated-analysis",
      buildAnalysisCommand(),
      { cwd: "/tmp", timeout: "45s" }
    );

    await sandbox.destroy("destroy-analysis-sandbox");

    const analysis =
      parseAnalysisStdout(result.stdout) ??
      analyzeChangelogLocal(changelogCorpus);

    return {
      mode: "sandbox",
      sandboxId: sandbox.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.output.truncated,
      analysis,
    };
  }

  return args.step.run("run-generated-analysis", async () => {
    await sleep(650);
    const analysis = analyzeChangelogLocal(changelogCorpus);
    const stdout = `${JSON.stringify(analysis)}\n`;

    return {
      mode: "simulated",
      sandboxId: `sbx-simulated-${args.researchRunId.slice(0, 8)}`,
      exitCode: 0,
      stdout,
      stderr: "",
      truncated: false,
      analysis,
    } satisfies SandboxAnalysisResult;
  });
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
 * checkSandboxAccess - including the first paint of the loop demo, which
 * fetches /api/demo/status before it can label the sandbox toggle. Failing
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
