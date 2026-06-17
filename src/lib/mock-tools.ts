/**
 * Mock tool set for the durable code-triage agent.
 *
 * The LLM is mocked (see mock-llm.ts), so these tool definitions exist only
 * for trace/code display and to drive deterministic, per-bug staged
 * responses. We deliberately do NOT import `@anthropic-ai/sdk`; the booth
 * demo runs with no Anthropic key. The shape mirrors the Anthropic tool
 * schema (name / description / inputSchema) so the ported agent reads as
 * "the same agent, mocked."
 *
 * Crash semantics (locked, ported from inngest-agents/demo/lib/tools.ts):
 * the FIRST `read_repo_file` whose `path` includes the active bug report's
 * `crashFile` throws a simulated 503. A module-scoped flag survives the
 * Inngest function retry within the worker process, so on the retry the
 * step.run re-executes this tool, the flag is already set, and it returns the
 * staged response. `resetCrashState()` is called by the function on
 * `attempt === 0`.
 */

import { getIncident } from "@/content/incidents";

export type ToolName =
  | "read_issue_context"
  | "search_code"
  | "read_repo_file"
  | "get_recent_commits"
  | "create_linear_ticket"
  | "send_slack_message"
  | "suggest_code_change"
  | "open_pull_request";

export type ToolDef = {
  name: ToolName;
  description: string;
  // JSON-schema-ish, for trace/code display only (LLM is mocked).
  inputSchema: Record<string, unknown>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "read_issue_context",
    description:
      "Load the bug report, customer impact, linked logs, repo, and owner hints before touching code. This is the first investigative step in the Gester-style code triage flow.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "The incoming bug id, e.g. EXE-1737.",
        },
        repo: {
          type: "string",
          description: "Repo identifier, e.g. 'inngest'.",
        },
      },
      required: ["issueId", "repo"],
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
  {
    name: "create_linear_ticket",
    description:
      "Create or update the Linear bug ticket with owner, priority, repro summary, suspected files, and acceptance criteria. Mocked and idempotent for the booth.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Linear team key." },
        title: { type: "string", description: "Ticket title." },
        priority: { type: "string", description: "Priority label." },
        summary: { type: "string", description: "Short issue summary." },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files the ticket should link to.",
        },
      },
      required: ["team", "title", "priority", "summary"],
    },
  },
  {
    name: "send_slack_message",
    description:
      "Send the team a concise Slack update with impact, evidence, and the proposed next action. Mocked for the booth; no live Slack write happens.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel name." },
        message: { type: "string", description: "Message body." },
        threadKey: {
          type: "string",
          description: "Stable key so retries do not duplicate the update.",
        },
      },
      required: ["channel", "message", "threadKey"],
    },
  },
  {
    name: "suggest_code_change",
    description:
      "Draft a focused code change with target files, rationale, and test plan. This is the mocked code suggestion Gester would hand to the engineer or PR tool.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo identifier." },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Target files for the suggested patch.",
        },
        summary: { type: "string", description: "Patch summary." },
        testPlan: { type: "string", description: "Suggested verification." },
      },
      required: ["repo", "files", "summary"],
    },
  },
  {
    name: "open_pull_request",
    description:
      "Open a pull request when the suggested change is small and high-confidence. Mocked for the booth with deterministic PR metadata.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo identifier." },
        branch: { type: "string", description: "Branch name." },
        title: { type: "string", description: "PR title." },
        body: { type: "string", description: "PR body." },
      },
      required: ["repo", "branch", "title"],
    },
  },
];

// First-attempt crash on the active bug's crashFile read. Module-scoped flag
// survives step.run retries (Inngest re-invokes the handler with prior steps
// memoized, so only the failed step re-executes. The second attempt skips
// the throw and returns the staged response.
let hasCrashed = false;

export function resetCrashState(): void {
  hasCrashed = false;
}

export function executeTool(
  incidentId: string,
  name: ToolName,
  input: Record<string, unknown>,
  ctx: { attempt: number }
): string {
  void ctx;
  const incident = getIncident(incidentId);

  if (!incident) {
    return `Unknown incident: ${incidentId}`;
  }

  // The mid-investigation failure point. The first time the agent reads the
  // active bug's crashFile, simulate a transient 503 rate limit. The flag
  // persists across function retries in this worker process; on the retry,
  // the step.run re-executes this tool once more and the flag is now true →
  // it falls through to the staged response.
  if (name === "read_repo_file") {
    const path = String(input.path ?? "");
    if (incident.crashFile && path.includes(incident.crashFile) && !hasCrashed) {
      hasCrashed = true;
      throw new Error(
        "Repo API: 503 rate limited. Cannot read repo file at this time. " +
          "(Simulated for demo: imagine your investigation just hit the " +
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
      return `${path}\n\n(file not available: content not in local clone)`;
    }
    case "get_recent_commits": {
      const path = input.path ? ` touching ${String(input.path)}` : "";
      return `No recent commits found${path}.`;
    }
    case "read_issue_context":
      return `No issue context found for ${String(input.issueId ?? "")}.`;
    case "create_linear_ticket":
      return `Linear ticket mock skipped for ${String(input.title ?? "untitled")}.`;
    case "send_slack_message":
      return `Slack mock skipped for ${String(input.channel ?? "unknown channel")}.`;
    case "suggest_code_change":
      return `No code suggestion generated for ${String(input.repo ?? "repo")}.`;
    case "open_pull_request":
      return `PR mock skipped for ${String(input.branch ?? "branch")}.`;
    default:
      return `Unknown tool: ${name}`;
  }
}
