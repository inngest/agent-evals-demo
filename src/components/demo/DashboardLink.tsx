"use client";

import * as React from "react";

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
    const opened = window.open(href, DASHBOARD_TARGET, "noopener,noreferrer");
    if (opened) {
      opened.opener = null;
    }
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
