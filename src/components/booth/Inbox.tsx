"use client";

import * as React from "react";
import { consoleCopy } from "@/content/booth-copy";
import type { SupportTicket, SupportTicketId } from "@/content/support-demo";
import { Avatar } from "./Thread";

export type TicketStatus = "open" | "working" | "resolved" | "escalated";
/**
 * sidebar: the landscape console's left column. strip: a portrait console's
 * band over the thread, the two groups side by side. strip-narrow drops the
 * QR code, for a phone that is already holding the page.
 */
export type InboxLayout = "sidebar" | "strip" | "strip-narrow";

const copy = consoleCopy;

/**
 * The helpdesk inbox: the three preset tickets, the outage switch (a feature
 * flag, as an ops team would have one), and the call to action.
 */
export function Inbox({
  tickets,
  activeId,
  statusOf,
  onPick,
  failureArmed,
  onToggleFailure,
  qrSvg,
  layout = "sidebar",
}: {
  tickets: SupportTicket[];
  activeId: SupportTicketId | null;
  statusOf: (id: SupportTicketId) => TicketStatus;
  onPick: (index: number) => void;
  failureArmed: boolean;
  onToggleFailure: () => void;
  qrSvg: string;
  layout?: InboxLayout;
}) {
  const open = tickets.filter((ticket) => {
    const status = statusOf(ticket.id);
    return status === "open" || status === "working";
  }).length;

  const outageSwitch = <OutageSwitch on={failureArmed} onToggle={onToggleFailure} />;
  const qr = (size: string) => (
    <div
      className={`acme-qr ${size} shrink-0 bg-white p-1.5`}
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );

  // Portrait, with a ticket open: the thread needs the room, so the inbox
  // folds to one row of chips. The outage switch is in the status bar.
  if (layout !== "sidebar" && activeId !== null) {
    return (
      <nav
        className="grid min-w-0 grid-cols-4 gap-2 border-b border-[var(--acme-line)] bg-[var(--acme-sidebar)] px-4 py-3"
        aria-label={copy.inbox.title}
      >
        {tickets.map((ticket, index) => {
          const status = statusOf(ticket.id);
          return (
            <button
              key={ticket.id}
              type="button"
              className="acme-chip grid min-w-0 text-left"
              data-group={ticket.group}
              data-active={ticket.id === activeId}
              onClick={() => onPick(index)}
              title={`${ticket.title} (${index + 1})`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="acme-chip-dot" data-status={status} aria-hidden />
                <span className="truncate text-[19px] font-semibold">
                  {ticket.customer.split(" ")[0]}
                </span>
              </span>
              <span className="truncate text-[17px] text-[var(--acme-muted)]">{ticket.title}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  if (layout !== "sidebar") {
    return (
      <aside className="grid min-w-0 gap-3 border-b border-[var(--acme-line)] bg-[var(--acme-sidebar)] px-5 pb-4 pt-4">
        <header className="flex items-baseline gap-4 px-2">
          <h2 className="text-[24px] font-semibold">{copy.inbox.title}</h2>
          <span className="text-[18px] text-[var(--acme-muted)]">{copy.inbox.open(open)}</span>
        </header>
        <div
          className="grid min-w-0 gap-4"
          style={{
            gridTemplateColumns:
              layout === "strip" ? "minmax(0,1fr) minmax(0,1fr) auto" : "minmax(0,1fr) minmax(0,1fr)",
          }}
        >
        {(["good", "bad"] as const).map((group) => (
          <section key={group} className="grid min-w-0 content-start gap-1.5">
            <h3 className="acme-group px-3 text-[16px]" data-group={group}>
              {copy.inbox.groups[group]}
            </h3>
            <ol className="grid gap-1.5">
              {tickets.map((ticket, index) =>
                ticket.group === group ? (
                  <li key={ticket.id}>
                    <TicketCard
                      compact
                      ticket={ticket}
                      index={index}
                      active={ticket.id === activeId}
                      status={statusOf(ticket.id)}
                      onPick={onPick}
                    />
                  </li>
                ) : null,
              )}
            </ol>
          </section>
        ))}
          {layout === "strip" ? (
            <div className="grid w-[150px] content-start justify-items-center gap-2 pt-1 text-center">
              {qr("size-[112px]")}
              <div className="text-[17px] font-semibold leading-tight">{copy.cta.title}</div>
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-[var(--acme-line)] bg-[var(--acme-sidebar)]">
      <header className="flex items-baseline justify-between px-7 pb-4 pt-7">
        <h2 className="text-[26px] font-semibold">{copy.inbox.title}</h2>
        <span className="text-[19px] text-[var(--acme-muted)]">{copy.inbox.open(open)}</span>
      </header>

      <div className="grid content-start gap-4 overflow-y-auto px-4">
        {(["good", "bad"] as const).map((group) => (
          <section key={group} className="grid gap-1.5">
            <h3 className="acme-group px-3 text-[16px]" data-group={group}>
              {copy.inbox.groups[group]}
            </h3>
            <ol className="grid gap-1.5">
              {tickets.map((ticket, index) =>
                ticket.group === group ? (
                  <li key={ticket.id}>
                    <TicketCard
                      ticket={ticket}
                      index={index}
                      active={ticket.id === activeId}
                      status={statusOf(ticket.id)}
                      onPick={onPick}
                    />
                  </li>
                ) : null,
              )}
            </ol>
          </section>
        ))}
      </div>

      <footer className="grid gap-4 border-t border-[var(--acme-line)] px-7 py-5">
        <label className="flex cursor-pointer items-center justify-between gap-4" title={`${copy.outage.hint} (F)`}>
          <span className="text-[19px] leading-tight">{copy.outage.label}</span>
          {outageSwitch}
        </label>
        <div className="flex items-center gap-4">
          {qr("size-[104px]")}
          <div className="grid gap-1">
            <div className="text-[20px] font-semibold">{copy.cta.title}</div>
            <div className="text-[17px] leading-snug text-[var(--acme-muted)]">{copy.cta.body}</div>
          </div>
        </div>
      </footer>
    </aside>
  );
}

function TicketCard({
  ticket,
  index,
  active,
  status,
  onPick,
  compact = false,
}: {
  ticket: SupportTicket;
  index: number;
  active: boolean;
  status: TicketStatus;
  onPick: (index: number) => void;
  /** One line for the portrait strip: the status sits beside the name. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        className="acme-ticket grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-left"
        data-active={active}
        data-compact
        onClick={() => onPick(index)}
        title={`Open ticket (${index + 1})`}
      >
        <Avatar name={ticket.customer} small />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[20px] font-semibold">{ticket.customer}</span>
            {status === "open" ? null : (
              <span className="acme-status shrink-0" data-status={status}>
                {copy.inbox.status[status]}
              </span>
            )}
          </div>
          <div className="truncate text-[19px]">{ticket.title}</div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="acme-ticket grid w-full grid-cols-[minmax(0,1fr)] gap-1.5 text-left"
      data-active={active}
      onClick={() => onPick(index)}
      title={`Open ticket (${index + 1})`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={ticket.customer} small />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[21px] font-semibold">{ticket.customer}</span>
            <span className="shrink-0 text-[17px] text-[var(--acme-muted)]">
              {ticket.receivedAgo}
            </span>
          </div>
          <div className="truncate text-[21px]">{ticket.title}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[60px]">
        <span className="acme-tag">{ticket.tag}</span>
        <span className="acme-status" data-status={status}>
          {copy.inbox.status[status]}
        </span>
      </div>
    </button>
  );
}

/** The outage feature flag: in the inbox footer, or the portrait status bar. */
export function OutageSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="acme-switch"
      data-on={on}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}
