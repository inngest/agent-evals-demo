/**
 * Mock tool set for the durable incident-triage agent.
 *
 * The LLM is mocked (see mock-llm.ts), so these tool definitions exist only
 * for trace/code display and to drive deterministic, per-incident staged
 * responses. We deliberately do NOT import `@anthropic-ai/sdk`; the booth
 * demo runs with no Anthropic key. The shape mirrors the Anthropic tool
 * schema (name / description / inputSchema) so the ported agent reads as
 * "the same agent, mocked."
 *
 * Crash semantics (locked, ported from inngest-agents/demo/lib/tools.ts):
 * the FIRST `read_repo_file` whose `path` includes the active incident's
 * `crashFile` throws a simulated 503. A module-scoped flag survives the
 * Inngest function retry within the worker process, so on the retry the
 * step.run re-executes this tool, the flag is already set, and it returns the
 * staged response. `resetCrashState()` is called by the function on
 * `attempt === 0`.
 */

import { getIncident } from "@/content/incidents";

export type ToolName =
  | "get_run"
  | "get_run_steps"
  | "search_code"
  | "read_repo_file"
  | "get_recent_commits";

export type ToolDef = {
  name: ToolName;
  description: string;
  // JSON-schema-ish, for trace/code display only (LLM is mocked).
  inputSchema: Record<string, unknown>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_run",
    description:
      "Fetch a failing Inngest run's metadata and status (function id, trigger event, attempt, error summary). This is the first investigative step: confirm what failed before reading code.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The Inngest run id of the failing run.",
        },
      },
      required: ["runId"],
    },
  },
  {
    name: "get_run_steps",
    description:
      "List the steps of an Inngest run in execution order and identify which step errored, with the memoized inputs/outputs of prior steps. Use after get_run to localize the failure to a specific step.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The Inngest run id whose steps to list.",
        },
      },
      required: ["runId"],
    },
  },
  {
    name: "search_code",
    description:
      "Search code across local Inngest repository clones using ripgrep. Use this to find references to an error type, function, or symbol when investigating a bug. Returns file paths with line numbers and matched lines.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search pattern. Regex-compatible.",
        },
        repos: {
          type: "array",
          items: { type: "string" },
          description: "Repos to search, e.g. ['inngest'] for the main monorepo.",
        },
        fileGlob: {
          type: "string",
          description: "File glob to scope the search, e.g. '*.go' or '*.ts'.",
        },
      },
      required: ["query", "repos"],
    },
  },
  {
    name: "read_repo_file",
    description:
      "Read a specific range of lines from a file in a local repo clone. Use this after search_code to inspect the actual code at a hit site. Provide lineStart/lineEnd to scope the read; otherwise the first 100 lines are returned.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repo identifier, e.g. 'inngest'.",
        },
        path: {
          type: "string",
          description: "Path within the repo, e.g. 'pkg/execution/queue/process.go'.",
        },
        lineStart: { type: "number" },
        lineEnd: { type: "number" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "get_recent_commits",
    description:
      "List recent commits touching a path in a repo, newest first. Surfaces the regression commit that likely introduced the bug. Use once you've localized the suspect file.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repo identifier, e.g. 'inngest'.",
        },
        path: {
          type: "string",
          description: "Optional path to scope commits to a file or directory.",
        },
        limit: {
          type: "number",
          description: "Max number of commits to return. Default 10.",
        },
      },
      required: ["repo"],
    },
  },
];

// First-attempt crash on the incident's crashFile read. Module-scoped flag
// survives step.run retries (Inngest re-invokes the handler with prior steps
// memoized — only the failed step re-executes), so the second attempt skips
// the throw and returns the staged response.
let hasCrashed = false;

export function resetCrashState(): void {
  hasCrashed = false;
}

export function executeTool(
  incidentId: string,
  name: ToolName,
  input: Record<string, unknown>,
  _ctx: { attempt: number }
): string {
  const incident = getIncident(incidentId);

  if (!incident) {
    return `Unknown incident: ${incidentId}`;
  }

  // The mid-investigation failure point. The first time the agent reads the
  // incident's crashFile, simulate a transient 503 rate limit. The flag
  // persists across function retries in this worker process; on the retry,
  // the step.run re-executes this tool once more and the flag is now true →
  // it falls through to the staged response.
  if (name === "read_repo_file") {
    const path = String(input.path ?? "");
    if (incident.crashFile && path.includes(incident.crashFile) && !hasCrashed) {
      hasCrashed = true;
      throw new Error(
        "Repo API: 503 rate limited. Cannot read repo file at this time. " +
          "(Simulated for demo — imagine your investigation just hit the " +
          "abuse rate limiter mid-flight.)"
      );
    }
  }

  const inputJson = JSON.stringify(input ?? {});
  const staged = incident.stagedToolResponses.find(
    (s) => s.tool === name && inputJson.includes(s.match)
  );

  if (staged) {
    return staged.response;
  }

  return genericNoResult(name, input);
}

function genericNoResult(name: ToolName, input: Record<string, unknown>): string {
  switch (name) {
    case "search_code": {
      const query = String(input.query ?? "");
      return `Searching '${query}' across inngest/*...\n\nNo results.`;
    }
    case "read_repo_file": {
      const path = String(input.path ?? "");
      return `${path}\n\n(file not available — content not in local clone)`;
    }
    case "get_recent_commits": {
      const path = input.path ? ` touching ${String(input.path)}` : "";
      return `No recent commits found${path}.`;
    }
    case "get_run":
      return `No run found for id ${String(input.runId ?? "")}.`;
    case "get_run_steps":
      return `No steps found for run ${String(input.runId ?? "")}.`;
    default:
      return `Unknown tool: ${name}`;
  }
}
