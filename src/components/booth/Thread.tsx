"use client";

import * as React from "react";
import {
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  History,
  LoaderCircle,
  MessageSquareText,
  RotateCw,
  Send,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import { consoleCopy, inngestLinks } from "@/content/booth-copy";
import {
  REPLY_STEP_ID,
  SANDBOX_STEP_ID,
  type SupportTicket,
} from "@/content/support-demo";
import { InngestLink } from "./DashboardLink";
import {
  formatSeconds,
  isEscalated,
  replyText,
  runTotals,
  type SandboxDetail,
  type StepView,
} from "./run-view";
import type { Feedback } from "./useAbTest";
import type { AgentRun } from "./useAgentRun";

// Matches FAILURE_RETRY_AFTER_MS in mock-support.ts. Not imported: that
// module is server-only.
const RETRY_AFTER_MS = 3000;

const copy = consoleCopy;

/** One agent run in the thread: turn 1, or the answer to a follow-up. */
export type TurnView = {
  run: AgentRun;
  views: StepView[];
  /** Deep link to this run; null until the live run is known, or on replay. */
  traceUrl: string | null;
};

export type FollowUpStage = "none" | "typing" | "sent";

/**
 * One ticket's conversation, as a helpdesk shows it: the customer's message,
 * the agent's activity as it works (one row per durable step, the same steps
 * the Inngest trace shows), and the reply. Scores live in Inngest, not here.
 * A ticket that goes badly may carry a second turn: the customer follows up
 * and the agent runs again.
 */
export function Thread({
  ticket,
  turns,
  followUpStage,
  feedback,
  onVote,
  refundScriptHtml,
  tall = false,
}: {
  ticket: SupportTicket | null;
  turns: TurnView[];
  followUpStage: FollowUpStage;
  feedback: Feedback | null;
  onVote: (signal: "good" | "bad") => void;
  /** The sandbox panel's refund script, highlighted on the server. */
  refundScriptHtml: string;
  /** Portrait console: the reply's status and vote share one line. */
  tall?: boolean;
}) {
  const body = React.useRef<HTMLDivElement>(null);

  // Keep the newest activity in view, as a chat does.
  const progress = [
    ...turns.map((turn) =>
      turn.views
        .map((view) =>
          [view.state, ...(view.sandbox?.stages.map((stage) => stage.state) ?? [])].join(),
        )
        .join(),
    ),
    ...turns.map((turn) => turn.run.phase),
    followUpStage,
    feedback?.receipt,
  ].join("|");
  React.useEffect(() => {
    const el = body.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [progress]);

  if (!ticket) return <EmptyThread />;

  const latest = turns[turns.length - 1];
  // The vote is on the conversation's last word: not while a follow-up is
  // still coming.
  const awaitingFollowUp = Boolean(ticket.followUp) && followUpStage !== "sent";
  const votable = latest?.run.phase === "complete" && !awaitingFollowUp;

  return (
    <section className="acme-console-thread grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--acme-panel)]">
      <header className="flex items-center justify-between gap-6 border-b border-[var(--acme-line)] px-10 py-5">
        <div className="flex min-w-0 items-center gap-5">
          <span data-role="avatar">
            <Avatar name={ticket.customer} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[30px] font-semibold leading-tight">
              {ticket.title}
            </div>
            <div className="text-[21px] text-[var(--acme-muted)]">
              <span data-role="aside">{ticket.customer} · </span>
              Ticket {ticket.number}
              <span data-role="aside"> · {ticket.tag}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {latest?.run.simulated ? (
            <span className="acme-pill" data-tone="warn" title={copy.thread.replayHint}>
              <History className="size-5" /> {copy.thread.replay}
            </span>
          ) : null}
          {latest?.traceUrl ? (
            <InngestLink href={latest.traceUrl} label={inngestLinks.trace} />
          ) : null}
        </div>
      </header>

      <div ref={body} className="min-h-0 overflow-y-auto overflow-x-hidden px-10 py-5">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          <Message who={ticket.customer} when={`${ticket.receivedAgo} ago`}>
            {ticket.message}
          </Message>

          {turns[0] ? (
            <RunBlock
              turn={turns[0]}
              ticket={ticket}
              collapsed={turns.length > 1}
              votable={votable && turns.length === 1}
              feedback={feedback}
              onVote={onVote}
              refundScriptHtml={refundScriptHtml}
              tall={tall}
            />
          ) : null}

          {ticket.followUp && followUpStage === "typing" ? (
            <div
              className="flex items-center gap-3 pl-16 text-[20px] text-[var(--acme-muted)]"
              data-role="typing"
            >
              <span className="acme-typing-dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              {copy.thread.typing(ticket.customer)}
            </div>
          ) : null}
          {ticket.followUp && followUpStage === "sent" ? (
            <Message who={ticket.customer} when="just now">
              {ticket.followUp.message}
            </Message>
          ) : null}

          {turns[1] ? (
            <RunBlock
              turn={turns[1]}
              ticket={ticket}
              collapsed={false}
              votable={votable}
              feedback={feedback}
              onVote={onVote}
              refundScriptHtml={refundScriptHtml}
              tall={tall}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** One run's activity, reply, and send line. */
function RunBlock({
  turn,
  ticket,
  collapsed,
  votable,
  feedback,
  onVote,
  refundScriptHtml,
  tall,
}: {
  turn: TurnView;
  ticket: SupportTicket;
  /** A later turn exists: fold this run's activity to one line. */
  collapsed: boolean;
  tall: boolean;
  votable: boolean;
  feedback: Feedback | null;
  onVote: (signal: "good" | "bad") => void;
  refundScriptHtml: string;
}) {
  const { run, views, traceUrl } = turn;
  const complete = run.phase === "complete";
  const reply = replyText(views);
  const escalated = isEscalated(views);
  const started = views.filter((view) => view.state !== "pending");
  const totals = runTotals(run.timeline, views);
  const agentName = run.turn === 2 ? copy.thread.followUpAgent : copy.thread.agent;

  return (
    <>
      {collapsed ? (
        <div className="acme-activity flex items-center gap-3 px-5 py-3 text-[20px] text-[var(--acme-muted)]">
          <Bot className="size-6 text-[var(--acme-accent)]" />
          <span className="font-semibold">{agentName}</span>
          <span className="tabnum">
            · {copy.thread.collapsed(started.length, formatSeconds(totals.durationMs))}
          </span>
          {traceUrl ? (
            <InngestLink href={traceUrl} label={inngestLinks.traceShort} variant="inline" />
          ) : null}
        </div>
      ) : (
        <div className="acme-activity grid gap-1">
          <div className="flex items-center gap-3 px-5 pb-1 pt-3 text-[20px] font-semibold text-[var(--acme-muted)]">
            <Bot className="size-6 text-[var(--acme-accent)]" />
            {agentName}
            {!complete && run.phase !== "idle" ? (
              <span className="font-normal">· {copy.thread.agentWorking}</span>
            ) : null}
          </div>
          <ol className="grid">
            {started.map((view) =>
              view.sandbox ? (
                // Keyed by run, so a manual toggle doesn't carry to the next ticket.
                <SandboxRow
                  key={`${run.supportRunId}-sandbox`}
                  view={view}
                  sandbox={view.sandbox}
                  complete={complete}
                  scriptHtml={refundScriptHtml}
                />
              ) : (
                <ActivityRow key={view.def.id} view={view} model={run.model} />
              ),
            )}
            {started.length === 0 ? (
              <li className="acme-row" data-state="running">
                <LoaderCircle className="size-7 animate-spin" />
                <span className="text-[23px]">{copy.activity.running}</span>
              </li>
            ) : null}
          </ol>
        </div>
      )}

      {reply && !collapsed ? (
        <AgentReply
          reply={reply}
          agentName={agentName}
          sent={complete}
          blocked={escalated}
          votable={votable}
          feedback={feedback}
          onVote={onVote}
          // Portrait: status and vote on one line, in place of the three
          // lines below.
          footer={
            tall && complete ? (escalated ? copy.escalation.note : copy.sent.label(ticket.customer)) : null
          }
        />
      ) : null}
      {reply && collapsed ? (
        <div className="flex min-w-0 justify-end">
          <div className="acme-reply min-w-0 max-w-[min(1180px,100%)] opacity-80">
            <div className="text-[21px] leading-[1.4]">{reply}</div>
          </div>
        </div>
      ) : null}

      {complete && escalated && !collapsed && !tall ? (
        <div className="acme-escalation flex items-center gap-3 justify-self-end text-[21px]">
          <UserRound className="size-5" /> {copy.escalation.note}
        </div>
      ) : null}

      {complete && !collapsed && !tall ? (
        <div className="acme-sent flex flex-wrap items-center gap-x-4 gap-y-1 text-[21px]">
          <Send className="size-5" />
          <span className="font-semibold">
            {escalated ? copy.activity.flagged : copy.sent.label(ticket.customer)}
          </span>
        </div>
      ) : null}

    </>
  );
}

function EmptyThread() {
  return (
    <section className="grid h-full place-items-center bg-[var(--acme-panel)] px-16">
      <div className="grid max-w-[760px] justify-items-center gap-5 text-center">
        <MessageSquareText className="size-16 text-[var(--acme-accent)]" />
        <h2 className="text-[40px] font-semibold leading-tight">{copy.empty.title}</h2>
        <p className="text-[25px] leading-[1.45] text-[var(--acme-muted)]">{copy.empty.body}</p>
      </div>
    </section>
  );
}

function ActivityRow({ view, model }: { view: StepView; model: string }) {
  const flagged = view.state === "done" && view.flagged;

  return (
    <li className="acme-row" data-state={view.state} data-flagged={flagged}>
      <RowHeader view={view} model={model} />
    </li>
  );
}

/** The three cells of an activity row: icon, label and detail, pills. */
function RowHeader({
  view,
  model,
  trailing,
}: {
  view: StepView;
  model: string;
  trailing?: React.ReactNode;
}) {
  const { state } = view;
  const summary =
    view.def.id === REPLY_STEP_ID && state === "done"
      ? copy.activity.reply(model, view.tokens)
      : view.output;
  const flagged = state === "done" && view.flagged;

  return (
    <>
      {flagged ? <ShieldAlert className="size-7" /> : <RowIcon state={state} />}
      <div className="min-w-0">
        {/* One line when there is room; the detail wraps under the label
            when there is not (beside the code drawer). */}
        <div className="flex flex-wrap items-baseline gap-x-3" data-role="row-line">
          <span className="shrink-0 text-[23px] font-semibold">{view.def.label}</span>
          <span className="acme-source">{view.def.source}</span>
          <span
            className="min-w-0 flex-[1_1_320px] truncate text-[20px] text-[var(--acme-muted)]"
            data-role="detail"
          >
            {state === "retrying"
              ? copy.activity.failed(view.def.source)
              : state === "running"
                ? copy.activity.running
                : state === "errored"
                  ? (view.errorMessage ?? copy.activity.failed(view.def.source))
                  : summary}
          </span>
        </div>
        {state === "done" && view.recovered ? (
          <div className="acme-recovered flex flex-wrap items-center gap-x-3 text-[19px]">
            <RotateCw className="size-4" />
            <span>
              {copy.activity.recovered} · {view.failedAttempts.length || 1} failed attempt (503)
            </span>
          </div>
        ) : null}
      </div>
      <div className="tabnum flex shrink-0 items-center gap-4 text-[20px] text-[var(--acme-muted)]">
        {view.def.id === SANDBOX_STEP_ID ? (
          <span className="acme-pill" data-tone="accent">
            <Box className="size-4" /> {copy.activity.sandboxed}
          </span>
        ) : null}
        {view.memoized ? (
          <span className="acme-pill" data-tone="ok">
            <History className="size-4" /> {copy.activity.kept}
          </span>
        ) : null}
        {flagged ? (
          <span className="acme-pill" data-tone="warn">
            <UserRound className="size-4" /> {copy.activity.flagged}
          </span>
        ) : null}
        {state === "retrying" ? (
          <RetryCountdown />
        ) : state === "done" && view.durationMs !== undefined ? (
          <span data-role="duration">{formatSeconds(view.durationMs)}</span>
        ) : null}
        {trailing}
      </div>
    </>
  );
}

/**
 * The sandboxed refund: the row, plus a panel with the script, the sandbox's
 * lifecycle and what the script printed. Open while the agent works, folded
 * to the row once the run completes; a click overrides either.
 */
function SandboxRow({
  view,
  sandbox,
  complete,
  scriptHtml,
}: {
  view: StepView;
  sandbox: SandboxDetail;
  complete: boolean;
  scriptHtml: string;
}) {
  const [manual, setManual] = React.useState<boolean | null>(null);
  const open = manual ?? !complete;
  const text = copy.activity.sandbox;

  return (
    <li className="acme-sandbox-item">
      <div className="acme-row" data-state={view.state}>
        <RowHeader
          view={view}
          model=""
          trailing={
            <button
              type="button"
              className="acme-sandbox-toggle"
              aria-expanded={open}
              aria-label={open ? text.hide : text.show}
              title={open ? text.hide : text.show}
              onClick={() => setManual(!open)}
            >
              {open ? <ChevronDown className="size-6" /> : <ChevronRight className="size-6" />}
            </button>
          }
        />
      </div>
      {open ? (
        <div className="acme-sandbox">
          <div className="grid min-w-0 content-start gap-2">
            <div className="acme-sandbox-caption">{text.script}</div>
            <div
              className="code-html acme-sandbox-code"
              dangerouslySetInnerHTML={{ __html: scriptHtml }}
            />
          </div>
          <div className="grid min-w-0 content-start gap-4">
            <div className="grid gap-2">
              <div className="acme-sandbox-caption">{text.lifecycle}</div>
              <ol className="grid gap-1">
                {sandbox.stages.map((stage) => (
                  <li key={stage.id} className="acme-sandbox-stage" data-state={stage.state}>
                    <RowIcon state={stage.state} />
                    <span>{stage.label}</span>
                    <span className="tabnum text-[var(--acme-muted)]">
                      {stage.state === "done" && stage.durationMs !== undefined
                        ? formatSeconds(stage.durationMs)
                        : stage.state === "pending"
                          ? ""
                          : copy.activity.running}
                    </span>
                  </li>
                ))}
              </ol>
              {sandbox.simulated ? (
                <p className="acme-sandbox-note">{text.simulated}</p>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-2">
              <div className="acme-sandbox-caption">{text.output}</div>
              {sandbox.output ? (
                <pre className="acme-sandbox-output">
                  {JSON.stringify(sandbox.output, null, 2)}
                </pre>
              ) : (
                <p className="acme-sandbox-note">
                  {sandbox.stages.some((stage) => stage.id === SANDBOX_STEP_ID && stage.state === "done")
                    ? text.noOutput
                    : text.waiting}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function RowIcon({ state }: { state: StepView["state"] }) {
  if (state === "done") return <Check className="size-7" strokeWidth={3} />;
  if (state === "running") return <LoaderCircle className="size-7 animate-spin" />;
  if (state === "retrying" || state === "errored") return <CircleAlert className="size-7" />;
  return <span className="size-7" />;
}

function AgentReply({
  reply,
  agentName,
  sent,
  blocked,
  votable,
  feedback,
  onVote,
  footer,
}: {
  reply: string;
  agentName: string;
  sent: boolean;
  /** The policy check blocked this draft: it was never sent. */
  blocked: boolean;
  votable: boolean;
  feedback: Feedback | null;
  onVote: (signal: "good" | "bad") => void;
  /** Portrait: the sent or escalated line, shown beside the vote. */
  footer: string | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-end gap-3">
      <div className="acme-reply min-w-0 max-w-[min(1180px,100%)]" data-blocked={blocked}>
        <div className="mb-2 flex items-center gap-2 text-[19px] font-semibold opacity-80">
          <Bot className="size-5" /> {agentName}
          <span className="font-normal">
            {blocked ? `· ${copy.escalation.blocked}` : sent ? "· Sent" : "· Draft"}
          </span>
        </div>
        <div className="text-[24px] leading-[1.4]">{reply}</div>
      </div>
      {footer !== null ? (
        <div className="flex w-full min-w-0 items-center justify-between gap-4 text-[21px]">
          <span
            className={`inline-flex min-w-0 items-center gap-3 font-semibold ${blocked ? "text-[var(--acme-warn)]" : "text-[var(--acme-ok)]"}`}
          >
            {blocked ? <UserRound className="size-5 shrink-0" /> : <Send className="size-5 shrink-0" />}
            <span className="truncate">{footer}</span>
          </span>
          {votable ? (
            <span className="flex shrink-0 items-center gap-3">
              {feedback ? (
                <Receipt feedback={feedback} />
              ) : (
                <>
                  <VoteButton signal="good" feedback={feedback} onVote={onVote} />
                  <VoteButton signal="bad" feedback={feedback} onVote={onVote} />
                </>
              )}
            </span>
          ) : null}
        </div>
      ) : votable ? (
        <div className="flex flex-wrap items-center justify-end gap-4 text-[21px]">
          <span className="text-[var(--acme-muted)]">{copy.feedback.prompt}</span>
          <VoteButton signal="good" feedback={feedback} onVote={onVote} />
          <VoteButton signal="bad" feedback={feedback} onVote={onVote} />
          {feedback ? <Receipt feedback={feedback} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function VoteButton({
  signal,
  feedback,
  onVote,
}: {
  signal: "good" | "bad";
  feedback: Feedback | null;
  onVote: (signal: "good" | "bad") => void;
}) {
  const Icon = signal === "good" ? ThumbsUp : ThumbsDown;
  const label = signal === "good" ? copy.feedback.good : copy.feedback.bad;

  return (
    <button
      type="button"
      className="acme-vote"
      data-active={feedback?.signal === signal}
      onClick={() => onVote(signal)}
      aria-label={label}
      title={`${label} (${signal === "good" ? "G" : "B"})`}
    >
      <Icon className="size-6" />
    </button>
  );
}

function Receipt({ feedback }: { feedback: Feedback }) {
  if (feedback.receipt === "pending") {
    return (
      <span className="inline-flex items-center gap-2 text-[var(--acme-muted)]">
        <LoaderCircle className="size-5 animate-spin" /> {copy.feedback.pending}
      </span>
    );
  }

  if (feedback.receipt === "offline") {
    return <span className="text-[var(--acme-muted)]">{copy.feedback.offline}</span>;
  }

  return (
    <span className="inline-flex items-center gap-2 text-[var(--acme-ok)]">
      <Check className="size-5" strokeWidth={3} />
      {feedback.receipt === "recorded" ? copy.feedback.recorded : copy.feedback.sent}
    </span>
  );
}

function Message({
  who,
  when,
  children,
}: {
  who: string;
  when: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-4">
      <span data-role="avatar">
        <Avatar name={who} small />
      </span>
      <div className="acme-message min-w-0 max-w-[min(1180px,100%)]">
        <div className="mb-1 text-[19px]" data-role="byline">
          <span className="font-semibold">{who}</span>
          <span className="text-[var(--acme-muted)]"> · {when}</span>
        </div>
        <div className="text-[24px] leading-[1.4]">{children}</div>
      </div>
    </div>
  );
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^A-Z]/gi, "")
    .slice(0, 2);

  return (
    <span
      className={`acme-avatar grid shrink-0 place-items-center font-semibold ${small ? "size-12 text-[19px]" : "size-16 text-[24px]"}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/**
 * Seconds until Inngest retries the failed step. Mounted only while the step
 * is retrying, so its mount time is the moment the console first saw the 503.
 */
function RetryCountdown() {
  const [since] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(since);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = Math.ceil((RETRY_AFTER_MS - (now - since)) / 1000);

  return (
    <span className="acme-pill" data-tone="bad">
      <RotateCw className="size-4" />
      {secondsLeft > 0 ? copy.activity.retryIn(secondsLeft) : copy.activity.retryNow}
    </span>
  );
}
