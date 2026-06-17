import type { ToolPlanStep } from "@/content/incidents";
import type { ToolName } from "@/lib/mock-tools";

export function modelStepName(
  planStep: ToolPlanStep | undefined,
  iteration: number
) {
  if (!planStep) return "write-code-triage-summary";
  if (iteration === 1) return "plan-code-triage";

  switch (planStep.tool) {
    case "read_issue_context":
      return "scope-bug-report";
    case "search_code":
      return `plan-repo-search-${slugStepValue(planStep.input.query)}`;
    case "read_repo_file":
      return `select-file-${slugPath(planStep.input.path)}`;
    case "get_recent_commits":
      return `plan-commit-history-${slugPath(planStep.input.path)}`;
    case "create_linear_ticket":
      return "plan-linear-ticket";
    case "send_slack_message":
      return "plan-team-update";
    case "suggest_code_change":
      return "plan-code-change";
    case "open_pull_request":
      return "plan-pull-request";
  }
}

export function toolStepName(planStep: ToolPlanStep, fallbackIndex: number) {
  switch (planStep.tool) {
    case "read_issue_context":
      return "load-issue-context";
    case "search_code":
      return `search-repo-${slugStepValue(planStep.input.query)}`;
    case "read_repo_file":
      return `read-file-${slugPath(planStep.input.path)}`;
    case "get_recent_commits":
      return `check-commits-${slugPath(planStep.input.path)}`;
    case "create_linear_ticket":
      return "create-linear-ticket";
    case "send_slack_message":
      return "send-slack-update";
    case "suggest_code_change":
      return "draft-code-change";
    case "open_pull_request":
      return "open-pull-request";
    default:
      return `run-tool-${fallbackIndex}-${String(planStep.tool as ToolName)}`;
  }
}

export function modelStepLabel(planStep: ToolPlanStep | undefined) {
  if (!planStep) return "Write triage summary";

  switch (planStep.tool) {
    case "read_issue_context":
      return "Scope bug report";
    case "search_code":
      return `Plan repo search: ${String(planStep.input.query ?? "query")}`;
    case "read_repo_file":
      return `Choose file: ${compactPath(planStep.input.path)}`;
    case "get_recent_commits":
      return `Plan commit check: ${compactPath(planStep.input.path)}`;
    case "create_linear_ticket":
      return "Plan Linear ticket";
    case "send_slack_message":
      return "Plan Slack update";
    case "suggest_code_change":
      return "Plan fix suggestion";
    case "open_pull_request":
      return "Plan pull request";
  }
}

export function toolStepLabel(planStep: ToolPlanStep) {
  switch (planStep.tool) {
    case "read_issue_context":
      return "Load issue context";
    case "search_code":
      return `Search repo: ${String(planStep.input.query ?? "query")}`;
    case "read_repo_file":
      return `Read file: ${compactPath(planStep.input.path)}`;
    case "get_recent_commits":
      return `Check commits: ${compactPath(planStep.input.path)}`;
    case "create_linear_ticket":
      return "Create Linear ticket";
    case "send_slack_message":
      return "Send Slack update";
    case "suggest_code_change":
      return "Draft code change";
    case "open_pull_request":
      return "Open pull request";
  }
}

export function modelStepDetail(planStep: ToolPlanStep | undefined) {
  if (!planStep) {
    return "The agent has enough evidence and writes the code-triage summary.";
  }

  switch (planStep.tool) {
    case "read_issue_context":
      return "Gester starts from the bug report, customer impact, repo, owner hints, and linked evidence.";
    case "search_code":
      return `The agent searches the repo for ${String(planStep.input.query ?? "the next symbol")}.`;
    case "read_repo_file":
      return `The agent selects ${String(planStep.input.path ?? "a file")} for source-level evidence.`;
    case "get_recent_commits":
      return "The agent checks the suspect path's recent history for a regression.";
    case "create_linear_ticket":
      return "The agent prepares the durable ticket update once the evidence is grounded.";
    case "send_slack_message":
      return "The agent decides what the owning team needs to know and where to post it.";
    case "suggest_code_change":
      return "The agent turns the evidence into a focused patch suggestion and test plan.";
    case "open_pull_request":
      return "The agent gates PR creation on a small, high-confidence fix path.";
  }
}

export function toolStepDetail(planStep: ToolPlanStep) {
  switch (planStep.tool) {
    case "read_issue_context":
      return `Load ${String(planStep.input.issueId ?? "the issue")} and linked context`;
    case "search_code":
      return `Search for ${String(planStep.input.query)}`;
    case "read_repo_file":
      return `Read ${String(planStep.input.path)}`;
    case "get_recent_commits":
      return `Recent commits for ${String(planStep.input.path ?? planStep.input.repo)}`;
    case "create_linear_ticket":
      return `Create/update ${String(planStep.input.team ?? "team")} ticket: ${String(planStep.input.title ?? "bug")}`;
    case "send_slack_message":
      return `Post update to ${String(planStep.input.channel ?? "Slack")}`;
    case "suggest_code_change":
      return `Draft fix for ${summarizeFiles(planStep.input.files)}`;
    case "open_pull_request":
      return `Open PR ${String(planStep.input.branch ?? "")}`;
  }
}

function slugPath(value: unknown) {
  const raw = String(value ?? "path");
  const parts = raw.split("/").filter(Boolean);
  const file = parts[parts.length - 1] ?? "path";
  const parent = parts[parts.length - 2];
  const stem = file.replace(/\.[^.]+$/, "");
  const compact =
    parent && parent !== stem ? [parent, file].join("-") : file;

  return slugStepValue(compact);
}

function slugStepValue(value: unknown) {
  return String(value ?? "step")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "step";
}

function compactPath(value: unknown) {
  const raw = String(value ?? "file");
  const parts = raw.split("/").filter(Boolean);
  return parts.length <= 2 ? raw : parts.slice(-2).join("/");
}

function summarizeFiles(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "target files";
  const files = value.map((file) => compactPath(file));
  return files.length <= 2 ? files.join(", ") : `${files.slice(0, 2).join(", ")} +${files.length - 2}`;
}
