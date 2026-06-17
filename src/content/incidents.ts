import type { ToolName } from "@/lib/mock-tools";

export type StagedToolResponse = {
  tool: ToolName;
  match: string;
  response: string;
};

export type ToolPlanStep = {
  tool: ToolName;
  input: Record<string, unknown>;
};

export type Incident = {
  id: string;
  title: string;
  body: string;
  repo: string;
  runId: string;
  crashFile: string;
  groundTruthFixFiles: string[];
  citedFiles: string[];
  rca: string;
  toolPlan: ToolPlanStep[];
  stagedToolResponses: StagedToolResponse[];
};

const STUB_SEARCH_RETRY_AFTER_ERROR = `Searching 'RetryAfterError' across inngest/* (*.go, max 50)...

Found 7 references:

pkg/execution/state/driver_response.go:45      type RetryAfterError struct {
pkg/execution/state/driver_response.go:52      func (e RetryAfterError) Error() string {
pkg/execution/state/driver_response.go:58      func (e RetryAfterError) Duration() time.Duration {
pkg/execution/driver/httpdriver/httpdriver.go:268    var retryAfter RetryAfterError
pkg/execution/driver/httpdriver/httpdriver.go:278    if errors.As(err, &retryAfter) {
pkg/sdk/v0/sdkrequest.go:312                   // parseRetryAfter handles RetryAfterError responses
internal/sdkresp/parse.go:189                  case "RetryAfterError":`;

const STUB_READ_HTTPDRIVER = `pkg/execution/driver/httpdriver/httpdriver.go  (lines 260-295)

260: func parseResponse(resp *http.Response) (*driver.Response, error) {
261:   body, err := io.ReadAll(resp.Body)
262:   if err != nil {
263:     return nil, err
264:   }
265:
266:   // 503 + Retry-After body means the SDK is asking us to back off
267:   if resp.StatusCode == 503 {
268:     var retryAfter RetryAfterError
269:     if err := json.Unmarshal(body, &retryAfter); err == nil {
270:       // SDK signaled a retry-after value (e.g. RateLimitError -> ~697s)
271:       retryAt := time.Now().Add(retryAfter.Duration())
272:       return &driver.Response{
273:         RetryAt: &retryAt,
274:         Status:  driver.StatusRetry,
275:       }, nil
276:     }
277:   }
278:
279:   // For other errors, wrap into queue.RetryAtError so the queue layer
280:   // can honor retry-at scheduling rather than falling back to default.
281:   if resp.RetryAt != nil {
282:     err = queue.RetryAtError(err, resp.RetryAt)
283:   }
284:   return nil, err
285: }`;

const STUB_SEARCH_RETRY_AT_ERROR = `Searching 'RetryAtError' across inngest/* (*.go, max 50)...

Found 12 references:

pkg/execution/queue/queue.go:127               func RetryAtError(err error, at *time.Time) error
pkg/execution/queue/queue.go:134               func AsRetryAtError(err error) *retryAtError
pkg/execution/queue/queue.go:146               func (r retryAtError) NextRetryAt() *time.Time
pkg/execution/queue/process.go:415             if specifier := AsRetryAtError(err); specifier != nil {
pkg/execution/executor/executor.go:3411        return queue.RetryAtError(err, resp.RetryAt)
pkg/execution/driver/httpdriver/httpdriver.go:282  err = queue.RetryAtError(err, resp.RetryAt)
pkg/execution/checkpoint/checkpoint.go         (NO references found - possible gap)
pkg/api/apiv1/checkpoint.go                    (NO references found)
pkg/runner/driver.go:518                       handle queue.RetryAtError
internal/queue/scheduler.go:204                queue.AsRetryAtError check
internal/queue/scheduler.go:267                fallback when AsRetryAtError == nil
pkg/execution/state/driver_response.go:71      // RetryAt is set by httpdriver, consumed by queue.RetryAtError`;

const STUB_READ_QUEUE_PROCESS = `pkg/execution/queue/process.go  (lines 400-440)

400: func (q *queue) ProcessItem(ctx context.Context, qi *QueueItem, err error) error {
401:   if err == nil {
402:     return q.markComplete(ctx, qi)
403:   }
404:
405:   if qi.Data.Attempt >= q.MaxAttempts {
406:     return q.markFailed(ctx, qi, err)
407:   }
408:
409:   // Default exponential backoff from the attempt number
410:   at := q.backoffFunc(qi.Data.Attempt)
411:
412:   // If the error wraps a RetryAtError, honor the specifier's NextRetryAt
413:   // value instead of the default backoff.
414:   if specifier := AsRetryAtError(err); specifier != nil {
415:     if next := specifier.NextRetryAt(); next != nil {
416:       at = *next
417:     }
418:   }
419:
420:   qi.Data.Attempt++
421:   return q.Enqueue(ctx, qi, at)
422: }`;

const STUB_SEARCH_BACKOFF_FUNC = `Searching 'c.BackoffFunc' across inngest/* (*.go, max 50)...

Found 4 references:

pkg/execution/checkpoint/checkpoint.go:275     retryAt := c.BackoffFunc(1)
pkg/execution/checkpoint/checkpoint.go:447     retryAt := c.BackoffFunc(attempt)
pkg/execution/queue/queue.go:88                BackoffFunc: backoff.Default,
pkg/execution/queue/process.go:410             at := q.backoffFunc(qi.Data.Attempt)

Notable: checkpoint.go uses BackoffFunc directly (no RetryAtError wrap) at two sites - :275 and :447.`;

const STUB_READ_CHECKPOINT = `pkg/execution/checkpoint/checkpoint.go  (lines 255-295)

255: // HandleStepError processes a step failure reported by the SDK via
256: // the checkpoint path. This bypasses the normal executor/queue
257: // retry pipeline because checkpoint runs synchronously inside the
258: // checkpoint API handler.
259:
260: func (c *checkpointer) HandleStepError(ctx context.Context, step Step, err error) error {
261:   switch op := opcode(err); op {
262:   case OpcodeStepError:
263:     // Parse the step error from the SDK response body
264:     stepErr, parseErr := unmarshalStepError(err)
265:     if parseErr != nil {
266:       return parseErr
267:     }
268:
269:     attempt := step.Attempt + 1
270:     if attempt > c.MaxAttempts {
271:       return c.MarkFailed(ctx, step, stepErr)
272:     }
273:
274:     // Compute retry time using default backoff
275:     retryAt := c.BackoffFunc(1)
276:     // NOTE: stepErr.RetryAt is parsed by httpdriver but not consulted here.
277:     // If we wanted to honor SDK-provided retry-after, we'd need:
278:     //   if stepErr.RetryAt != nil { retryAt = *stepErr.RetryAt }
279:
280:     return c.Enqueue(ctx, EnqueueItem{
281:       Step:    step,
282:       At:      retryAt,
283:       Error:   stepErr,
284:     })
285:
286:   case OpcodeStepCompleted:
287:     return c.markStepComplete(ctx, step)
288:
289:   default:
290:     return fmt.Errorf("cannot checkpoint opcode: %s", op)
291:   }
292: }`;

function issueContext(args: {
  id: string;
  title: string;
  body: string;
  repo: string;
  owner: string;
}) {
  return `Issue ${args.id}: ${args.title}
source: customer escalation + repository bug report
repo: ${args.repo}
owner hint: ${args.owner}
impact: ${args.body}

Gester checklist:
- understand the report and customer impact
- read the repo until there is source-level evidence
- create or update the Linear ticket
- send the owning team a Slack update
- suggest a targeted code change
- open a PR when the fix is small and high-confidence`;
}

function ticketKey(id: string) {
  return `BUG-${id.replace(/[^0-9]/g, "")}`;
}

function branchName(id: string) {
  return `gester/${id.toLowerCase()}-fix`;
}

function simpleIncident(args: {
  id: string;
  title: string;
  body: string;
  runId: string;
  crashFile: string;
  truth: string[];
  cited: string[];
  symptom: string;
  query: string;
  suspectFile: string;
  fix: string;
  scoreNote?: string;
}): Incident {
  const ticket = ticketKey(args.id);
  const branch = branchName(args.id);
  const plan: ToolPlanStep[] = [
    {
      tool: "read_issue_context",
      input: { issueId: args.id, repo: "inngest" },
    },
    {
      tool: "search_code",
      input: { query: args.query, repos: ["inngest"], fileGlob: "*.ts" },
    },
    {
      tool: "read_repo_file",
      input: { repo: "inngest", path: args.suspectFile, lineStart: 40, lineEnd: 120 },
    },
    {
      tool: "get_recent_commits",
      input: { repo: "inngest", path: args.suspectFile, limit: 4 },
    },
    {
      tool: "search_code",
      input: { query: args.fix, repos: ["inngest"], fileGlob: "*.ts" },
    },
    {
      tool: "create_linear_ticket",
      input: {
        team: "ENG",
        title: `${args.id}: ${args.title}`,
        priority: "high",
        summary: args.symptom,
        files: args.truth,
      },
    },
    {
      tool: "send_slack_message",
      input: {
        channel: "#eng-runtime",
        threadKey: args.id,
        message: `${args.id}: ${args.symptom}. Suspect ${args.suspectFile}; proposed fix: ${args.fix}.`,
      },
    },
    {
      tool: "suggest_code_change",
      input: {
        repo: "inngest",
        files: args.truth,
        summary: args.fix,
        testPlan: `Add regression coverage for ${args.title}.`,
      },
    },
    {
      tool: "open_pull_request",
      input: {
        repo: "inngest",
        branch,
        title: `fix: ${args.title.toLowerCase()}`,
        body: `Closes ${ticket}. ${args.fix}.`,
      },
    },
  ];

  return {
    id: args.id,
    title: args.title,
    body: args.body,
    repo: "inngest",
    runId: args.runId,
    crashFile: args.crashFile,
    groundTruthFixFiles: args.truth,
    citedFiles: args.cited,
    rca: `## Summary
${args.symptom}. Confidence: high.

## Evidence
- Issue \`${args.id}\` reports a code bug with customer impact, not an app-level function failure.
- Repo search for \`${args.query}\` points at \`${args.suspectFile}\`.
- Recent commits show a regression touching the same file.

## Analysis
The agent followed the bug report into the repo, read source, checked commits, then prepared the coordination work. The durable trace keeps each investigation and side-effect step separate, so the transient file-read failure does not erase the evidence already gathered or duplicate Linear, Slack, or PR actions.

## Recommendations
- Patch \`${args.suspectFile}\` so ${args.fix}.
- Track the fix in \`${ticket}\` and keep the Slack thread keyed by \`${args.id}\`.
- Review the mocked PR branch \`${branch}\` and land the regression test with the fix.

## Local verification prompt
Run the bug through the booth demo again and confirm the analysis cites ${args.cited.join(", ")}.${args.scoreNote ? `\n\n${args.scoreNote}` : ""}`,
    toolPlan: plan,
    stagedToolResponses: [
      {
        tool: "read_issue_context",
        match: args.id,
        response: issueContext({
          id: args.id,
          title: args.title,
          body: args.body,
          repo: "inngest",
          owner: "ENG",
        }),
      },
      {
        tool: "search_code",
        match: args.query,
        response: `Searching '${args.query}' across inngest/* (*.ts, max 50)...

Found 4 references:

${args.suspectFile}:64        // ${args.symptom}
${args.truth[0]}:88           expected control path
packages/platform/src/insights/events.ts:141  score attachment emitted
packages/runtime/src/replay/memoized.ts:33    memoized step guard`,
      },
      {
        tool: "read_repo_file",
        match: args.suspectFile,
        response: `${args.suspectFile} (lines 40-120)

40: export function scheduleNext(input: ScheduleInput) {
41:   const control = input.control;
42:   const attempt = input.attempt + 1;
43:
44:   // regression: the special Inngest control metadata is not carried through
45:   // this branch, so the scheduler falls back to the default path.
46:   const at = defaultBackoff(attempt);
47:
48:   return enqueue({ ...input, attempt, at });
49: }`,
      },
      {
        tool: "get_recent_commits",
        match: args.suspectFile,
        response: `Recent commits touching ${args.suspectFile}
9f31b92 tighten scheduler defaults
2c80d4e refactor control metadata plumbing
be71aa0 add replay guard for memoized steps`,
      },
      {
        tool: "search_code",
        match: args.fix,
        response: `Searching '${args.fix}' across inngest/* (*.ts, max 50)...

Found 2 likely fix sites:
${args.truth.map((file, index) => `${file}:${90 + index * 18}       preserve ${args.fix}`).join("\n")}`,
      },
      {
        tool: "create_linear_ticket",
        match: args.id,
        response: `Linear ${ticket} updated
team: ENG
priority: high
title: ${args.id}: ${args.title}
linked files: ${args.truth.join(", ")}
acceptance: patch ${args.suspectFile}; add regression coverage; post final status to Slack`,
      },
      {
        tool: "send_slack_message",
        match: args.id,
        response: `Slack message sent
channel: #eng-runtime
threadKey: ${args.id}
message: ${args.symptom}. Suspect ${args.suspectFile}. Tracking in ${ticket}.`,
      },
      {
        tool: "suggest_code_change",
        match: args.suspectFile,
        response: `Code suggestion drafted
repo: inngest
files:
${args.truth.map((file) => `- ${file}`).join("\n")}
summary: ${args.fix}
test plan: Add a regression fixture for ${args.title}.`,
      },
      {
        tool: "open_pull_request",
        match: branch,
        response: `Pull request opened
repo: inngest
branch: ${branch}
title: fix: ${args.title.toLowerCase()}
status: draft
links: ${ticket}`,
      },
    ],
  };
}

export const incidents: Incident[] = [
  {
    id: "EXE-1737",
    title: "RetryAfterError ignored when checkpointing is enabled",
    body:
      "A customer bug report says checkpointed SDK errors ignore RetryAfterError. They expected retry delays around 697s from the Retry-After value, but observed default backoff timings: 23s, 57s, 80s, 142s, 308s. They disabled checkpointing as a workaround. Read the repo, coordinate the fix, and cite file paths.",
    repo: "inngest",
    runId: "run-exe-1737",
    crashFile: "checkpoint.go",
    groundTruthFixFiles: [
      "pkg/execution/checkpoint/checkpoint.go",
      "pkg/execution/driver/httpdriver/httpdriver.go",
      "pkg/execution/queue/process.go",
    ],
    citedFiles: [
      "pkg/execution/checkpoint/checkpoint.go",
      "pkg/execution/driver/httpdriver/httpdriver.go",
      "pkg/execution/queue/process.go",
    ],
    rca: `## Summary
The checkpoint retry path parses the SDK RetryAfterError but schedules the retry with the default BackoffFunc instead of honoring RetryAt. Confidence: high.

## Evidence
- Issue \`EXE-1737\` is a repo bug with customer impact, not an app-level function failure.
- \`pkg/execution/driver/httpdriver/httpdriver.go:268-275\` turns the SDK 503 body into a driver response with \`RetryAt\`.
- \`pkg/execution/queue/process.go:412-418\` proves the normal queue path honors \`RetryAtError\`.
- \`pkg/execution/checkpoint/checkpoint.go:274-278\` uses \`c.BackoffFunc(1)\` and even notes that \`stepErr.RetryAt\` is not consulted.

## Analysis
The normal executor wraps retry-at metadata so the queue can schedule the next attempt at the SDK-provided time. The checkpoint handler bypasses that wrapper. When checkpointing is enabled, the step error is handled synchronously by the checkpoint path and the retry is enqueued with default backoff. Gester created the Linear ticket, posted the team update, drafted the patch plan, and opened a mocked PR only after the source evidence was gathered.

## Recommendations
- In \`pkg/execution/checkpoint/checkpoint.go\`, prefer \`stepErr.RetryAt\` when present before falling back to \`c.BackoffFunc\`.
- Add a checkpointing regression test with an SDK RetryAfterError body that expects the 697s retry-at timestamp.
- Track the fix in \`BUG-1737\`, post status to \`#eng-runtime\`, and review branch \`gester/exe-1737-fix\`.

## Local verification prompt
Run EXE-1737 through the demo, inspect the mocked PR plan, and assert the next attempt is scheduled from the Retry-After value.`,
    toolPlan: [
      {
        tool: "read_issue_context",
        input: { issueId: "EXE-1737", repo: "inngest" },
      },
      {
        tool: "search_code",
        input: { query: "RetryAfterError", repos: ["inngest"], fileGlob: "*.go" },
      },
      {
        tool: "read_repo_file",
        input: {
          repo: "inngest",
          path: "pkg/execution/driver/httpdriver/httpdriver.go",
          lineStart: 260,
          lineEnd: 295,
        },
      },
      {
        tool: "search_code",
        input: { query: "RetryAtError", repos: ["inngest"], fileGlob: "*.go" },
      },
      {
        tool: "read_repo_file",
        input: {
          repo: "inngest",
          path: "pkg/execution/queue/process.go",
          lineStart: 400,
          lineEnd: 440,
        },
      },
      {
        tool: "search_code",
        input: { query: "c.BackoffFunc", repos: ["inngest"], fileGlob: "*.go" },
      },
      {
        tool: "read_repo_file",
        input: {
          repo: "inngest",
          path: "pkg/execution/checkpoint/checkpoint.go",
          lineStart: 255,
          lineEnd: 295,
        },
      },
      {
        tool: "get_recent_commits",
        input: {
          repo: "inngest",
          path: "pkg/execution/checkpoint/checkpoint.go",
          limit: 4,
        },
      },
      {
        tool: "create_linear_ticket",
        input: {
          team: "ENG",
          title: "EXE-1737: RetryAfterError ignored when checkpointing is enabled",
          priority: "urgent",
          summary:
            "Checkpoint retry scheduling falls back to default backoff instead of honoring SDK Retry-After.",
          files: [
            "pkg/execution/checkpoint/checkpoint.go",
            "pkg/execution/driver/httpdriver/httpdriver.go",
            "pkg/execution/queue/process.go",
          ],
        },
      },
      {
        tool: "send_slack_message",
        input: {
          channel: "#eng-runtime",
          threadKey: "EXE-1737",
          message:
            "EXE-1737 localized to checkpoint retry scheduling. Normal queue honors RetryAtError; checkpoint path uses BackoffFunc. Tracking in BUG-1737.",
        },
      },
      {
        tool: "suggest_code_change",
        input: {
          repo: "inngest",
          files: [
            "pkg/execution/checkpoint/checkpoint.go",
            "pkg/execution/driver/httpdriver/httpdriver.go",
            "pkg/execution/queue/process.go",
          ],
          summary:
            "Prefer stepErr.RetryAt in checkpoint retry scheduling before falling back to BackoffFunc.",
          testPlan:
            "Add a checkpointing regression test with an SDK RetryAfterError body and assert the retry time is near 697s.",
        },
      },
      {
        tool: "open_pull_request",
        input: {
          repo: "inngest",
          branch: "gester/exe-1737-fix",
          title: "fix: honor retry-after in checkpoint retries",
          body: "Closes BUG-1737. Uses RetryAt when checkpointed SDK errors include a retry-after timestamp.",
        },
      },
    ],
    stagedToolResponses: [
      {
        tool: "read_issue_context",
        match: "EXE-1737",
        response: issueContext({
          id: "EXE-1737",
          title: "RetryAfterError ignored when checkpointing is enabled",
          body:
            "Checkpointed SDK errors ignore RetryAfterError and schedule default backoff instead of the Retry-After value.",
          repo: "inngest",
          owner: "ENG",
        }),
      },
      {
        tool: "search_code",
        match: "RetryAfterError",
        response: STUB_SEARCH_RETRY_AFTER_ERROR,
      },
      {
        tool: "read_repo_file",
        match: "httpdriver",
        response: STUB_READ_HTTPDRIVER,
      },
      {
        tool: "search_code",
        match: "RetryAtError",
        response: STUB_SEARCH_RETRY_AT_ERROR,
      },
      {
        tool: "read_repo_file",
        match: "queue/process",
        response: STUB_READ_QUEUE_PROCESS,
      },
      {
        tool: "search_code",
        match: "c.BackoffFunc",
        response: STUB_SEARCH_BACKOFF_FUNC,
      },
      {
        tool: "read_repo_file",
        match: "checkpoint.go",
        response: STUB_READ_CHECKPOINT,
      },
      {
        tool: "get_recent_commits",
        match: "checkpoint.go",
        response: `Recent commits touching pkg/execution/checkpoint/checkpoint.go
84f2c1a refactor checkpoint retry enqueue
7d1901e parse SDK RetryAfterError in driver response
2a0ac9d add checkpoint API handler tests
0ab7d21 wire queue RetryAtError helpers`,
      },
      {
        tool: "create_linear_ticket",
        match: "EXE-1737",
        response: `Linear BUG-1737 updated
team: ENG
priority: urgent
title: EXE-1737: RetryAfterError ignored when checkpointing is enabled
linked files: pkg/execution/checkpoint/checkpoint.go, pkg/execution/driver/httpdriver/httpdriver.go, pkg/execution/queue/process.go
acceptance: checkpoint retries honor SDK Retry-After; regression test covers 697s delay`,
      },
      {
        tool: "send_slack_message",
        match: "EXE-1737",
        response: `Slack message sent
channel: #eng-runtime
threadKey: EXE-1737
message: Localized to checkpoint retry scheduling. Normal queue honors RetryAtError, but checkpoint.go falls back to BackoffFunc. Tracking in BUG-1737.`,
      },
      {
        tool: "suggest_code_change",
        match: "checkpoint.go",
        response: `Code suggestion drafted
repo: inngest
files:
- pkg/execution/checkpoint/checkpoint.go
- pkg/execution/driver/httpdriver/httpdriver.go
- pkg/execution/queue/process.go
summary: prefer stepErr.RetryAt before BackoffFunc in checkpoint retry scheduling
test plan: add checkpointing regression test with SDK RetryAfterError body and assert retry delay is near 697s`,
      },
      {
        tool: "open_pull_request",
        match: "gester/exe-1737-fix",
        response: `Pull request opened
repo: inngest
branch: gester/exe-1737-fix
title: fix: honor retry-after in checkpoint retries
status: draft
links: BUG-1737`,
      },
    ],
  },
  simpleIncident({
    id: "EXE-1811",
    title: "Sleep-until jobs resume one tick late",
    body:
      "A batch of sleepUntil jobs resume one scheduler tick late after a worker restart. The customer sees a consistent 15 second tail on reminders.",
    runId: "run-exe-1811",
    crashFile: "packages/runtime/src/sleep-until.ts",
    truth: [
      "packages/runtime/src/sleep-until.ts",
      "packages/scheduler/src/tick-window.ts",
    ],
    cited: [
      "packages/runtime/src/sleep-until.ts",
      "packages/scheduler/src/tick-window.ts",
    ],
    symptom: "sleepUntil resumes are rounded to the next poll tick after replay",
    query: "sleepUntil tick window replay",
    suspectFile: "packages/runtime/src/sleep-until.ts",
    fix: "preserve wakeAt during replay",
  }),
  simpleIncident({
    id: "EXE-1842",
    title: "Throttle key collapses across tenants",
    body:
      "Two tenants with the same function slug throttle each other even though the function config scopes concurrency by account.",
    runId: "run-exe-1842",
    crashFile: "packages/execution/src/flow-control/throttle.ts",
    truth: [
      "packages/execution/src/flow-control/throttle.ts",
      "packages/execution/src/flow-control/key.ts",
    ],
    cited: ["packages/execution/src/flow-control/throttle.ts"],
    symptom: "the throttle key omits accountId when building the shared bucket",
    query: "throttle accountId bucket key",
    suspectFile: "packages/execution/src/flow-control/throttle.ts",
    fix: "include accountId in throttle keys",
    scoreNote: "This one is intentionally partial so the score history has a lower point.",
  }),
  simpleIncident({
    id: "EXE-1904",
    title: "Batch flush drops the final event",
    body:
      "A customer observes that the final event in a max-size batch disappears only when the flush races a deploy.",
    runId: "run-exe-1904",
    crashFile: "packages/execution/src/batching/flush.ts",
    truth: [
      "packages/execution/src/batching/flush.ts",
      "packages/execution/src/batching/window.ts",
    ],
    cited: [
      "packages/execution/src/batching/flush.ts",
      "packages/execution/src/batching/window.ts",
    ],
    symptom: "the flush cursor advances before the last event is durably written",
    query: "batch flush cursor final event",
    suspectFile: "packages/execution/src/batching/flush.ts",
    fix: "advance cursor after durable append",
  }),
  simpleIncident({
    id: "EXE-1938",
    title: "Debounce windows reopen after cancel",
    body:
      "Cancelled debounce windows can reopen when a late event arrives with the original debounce key.",
    runId: "run-exe-1938",
    crashFile: "packages/execution/src/debounce/window.ts",
    truth: [
      "packages/execution/src/debounce/window.ts",
      "packages/execution/src/debounce/cancel.ts",
    ],
    cited: ["packages/execution/src/debounce/window.ts"],
    symptom: "cancel tombstones are not checked before reopening a debounce window",
    query: "debounce cancel tombstone reopen",
    suspectFile: "packages/execution/src/debounce/window.ts",
    fix: "respect cancel tombstones",
  }),
  simpleIncident({
    id: "EXE-2016",
    title: "Idempotency key changes after replay",
    body:
      "A run with a side-effecting step emits a second webhook after replay because the idempotency key includes a volatile timestamp.",
    runId: "run-exe-2016",
    crashFile: "packages/runtime/src/idempotency.ts",
    truth: [
      "packages/runtime/src/idempotency.ts",
      "packages/runtime/src/replay/memoized.ts",
    ],
    cited: [
      "packages/runtime/src/idempotency.ts",
      "packages/runtime/src/replay/memoized.ts",
    ],
    symptom: "idempotency keys include Date.now during replay",
    query: "idempotency Date.now replay side effect",
    suspectFile: "packages/runtime/src/idempotency.ts",
    fix: "derive idempotency keys from event id and step id",
  }),
  simpleIncident({
    id: "EXE-2069",
    title: "Realtime publish arrives before step completion",
    body:
      "The UI sometimes shows a realtime progress event before the step that created it appears complete in the run trace.",
    runId: "run-exe-2069",
    crashFile: "packages/realtime/src/publish.ts",
    truth: [
      "packages/realtime/src/publish.ts",
      "packages/execution/src/steps/commit.ts",
    ],
    cited: [
      "packages/realtime/src/publish.ts",
      "packages/execution/src/steps/commit.ts",
    ],
    symptom: "realtime publish is committed outside the step transaction",
    query: "realtime publish transaction step complete",
    suspectFile: "packages/realtime/src/publish.ts",
    fix: "publish after step commit",
  }),
  simpleIncident({
    id: "EXE-2110",
    title: "Concurrency slot leaks on cancelled runs",
    body:
      "Cancelling a run frees the queue item but not the account-scoped concurrency slot, starving later runs.",
    runId: "run-exe-2110",
    crashFile: "packages/execution/src/concurrency/leases.ts",
    truth: [
      "packages/execution/src/concurrency/leases.ts",
      "packages/execution/src/cancel/run.ts",
    ],
    cited: ["packages/execution/src/concurrency/leases.ts"],
    symptom: "the cancel path skips releaseLease for account concurrency",
    query: "cancel releaseLease concurrency slot",
    suspectFile: "packages/execution/src/concurrency/leases.ts",
    fix: "release account concurrency lease on cancel",
  }),
  simpleIncident({
    id: "EXE-2185",
    title: "Step memoization misses object key order",
    body:
      "Two equivalent step inputs with different object key order produce separate memoized step records.",
    runId: "run-exe-2185",
    crashFile: "packages/runtime/src/replay/memoized.ts",
    truth: [
      "packages/runtime/src/replay/memoized.ts",
      "packages/runtime/src/hash/stable-json.ts",
    ],
    cited: [
      "packages/runtime/src/replay/memoized.ts",
      "packages/runtime/src/hash/stable-json.ts",
    ],
    symptom: "step memoization hashes JSON without stable key ordering",
    query: "memoized step stable json hash order",
    suspectFile: "packages/runtime/src/replay/memoized.ts",
    fix: "stable sort object keys before hashing",
  }),
  simpleIncident({
    id: "EXE-2244",
    title: "Queue partition hot-spots scheduled fanout",
    body:
      "Scheduled fanout jobs pile up on one partition when the event name is identical across thousands of customers.",
    runId: "run-exe-2244",
    crashFile: "packages/execution/src/queue/partition.ts",
    truth: [
      "packages/execution/src/queue/partition.ts",
      "packages/execution/src/events/hash.ts",
    ],
    cited: ["packages/execution/src/events/hash.ts"],
    symptom: "the partition hash uses event name but not account entropy",
    query: "queue partition hash account event name",
    suspectFile: "packages/execution/src/queue/partition.ts",
    fix: "mix account entropy into partition hash",
    scoreNote: "This RCA intentionally cites only one of the fix files.",
  }),
  simpleIncident({
    id: "EXE-2301",
    title: "Function pause leaves orphaned scheduled work",
    body:
      "Pausing a function stops new triggers but already-scheduled work still wakes and consumes attempts.",
    runId: "run-exe-2301",
    crashFile: "packages/execution/src/functions/pause.ts",
    truth: [
      "packages/execution/src/functions/pause.ts",
      "packages/execution/src/scheduler/wake.ts",
    ],
    cited: [
      "packages/execution/src/functions/pause.ts",
      "packages/execution/src/scheduler/wake.ts",
    ],
    symptom: "wake checks function status before enqueue but not before attempt consume",
    query: "function pause scheduled wake attempt",
    suspectFile: "packages/execution/src/functions/pause.ts",
    fix: "check paused status before consuming attempts",
  }),
  simpleIncident({
    id: "EXE-2377",
    title: "Flow-control burst ignores per-account fairness",
    body:
      "A single high-volume account can claim every worker for a function configured with account fairness.",
    runId: "run-exe-2377",
    crashFile: "packages/execution/src/flow-control/fairness.ts",
    truth: [
      "packages/execution/src/flow-control/fairness.ts",
      "packages/execution/src/queue/dequeue.ts",
    ],
    cited: [
      "packages/execution/src/flow-control/fairness.ts",
      "packages/execution/src/queue/dequeue.ts",
    ],
    symptom: "dequeue sorts by readiness but skips the account fairness cursor",
    query: "flow control account fairness dequeue cursor",
    suspectFile: "packages/execution/src/flow-control/fairness.ts",
    fix: "advance fairness cursor per dequeue",
  }),
];

export const defaultIncidentId = "EXE-1737";

export function getIncident(id: string): Incident | undefined {
  return incidents.find((incident) => incident.id === id);
}
