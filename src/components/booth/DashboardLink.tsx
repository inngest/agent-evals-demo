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
 * The console's "open in Inngest" link: the hand-off from the product to the
 * real trace, score or experiment. Styled apart from Acme's own controls so
 * the audience can see where the product ends and Inngest begins. Opens the
 * dashboard in its own window so the console stays put.
 */
export function InngestLink({
  href,
  label,
  variant = "button",
}: {
  href: string;
  label: string;
  /** "button" for headers and popovers, "inline" inside a row of text. */
  variant?: "button" | "inline";
}) {
  return (
    <DashboardLink
      href={href}
      className="inngest-link inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
      data-variant={variant}
    >
      {label}
      <ExternalLink className={variant === "inline" ? "size-[0.9em]" : "size-5"} />
    </DashboardLink>
  );
}
