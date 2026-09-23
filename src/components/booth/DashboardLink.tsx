"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";

type DashboardLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

const DASHBOARD_TARGET = "inngest-dashboard";

export function DashboardLink({
  children,
  href,
  onClick,
  rel,
  target,
  ...props
}: DashboardLinkProps) {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    // Dia has been observed reusing the current tab for plain _blank links.
    // Handle ordinary left-clicks ourselves so the demo state stays put.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    openDashboard(href);
  }

  return (
    <a
      href={href}
      target={target ?? DASHBOARD_TARGET}
      rel={rel ?? "noopener noreferrer"}
      onClick={handleClick}
      {...props}
    >
      {children}
    </a>
  );
}

/** Opens the Inngest dashboard in its own named window, never this tab. */
export function openDashboard(href: string) {
  const opened = window.open(href, DASHBOARD_TARGET, "noopener,noreferrer");
  if (opened) {
    opened.opener = null;
  }
}

/**
 * The booth's "open in Inngest" button: proof on demand, one click from any
 * screen. Opens the dashboard in its own window so the demo stays put.
 */
export function InngestLink({ href, label }: { href: string; label: string }) {
  return (
    <DashboardLink
      href={href}
      className="booth-inngest-link mono inline-flex items-center gap-2 border-2 border-[var(--ink)] bg-white px-3 py-1.5 text-[17px] uppercase"
    >
      <ExternalLink className="size-5" /> {label}
    </DashboardLink>
  );
}
