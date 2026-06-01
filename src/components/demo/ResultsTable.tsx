"use client";

import type { MockUser } from "@/content/seed-data";

export function ResultsTable({
  rows,
  isRunning,
}: {
  rows: MockUser[];
  isRunning: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="grid h-full min-h-0 place-items-center overflow-hidden border-t border-[var(--rule-soft)] bg-white">
        <div className="max-w-sm text-center">
          <div className="display text-2xl font-medium">Results land here.</div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">
            Ask the insights agent and the static SaaS users table fills in.
          </p>
          {isRunning ? (
            <div className="mx-auto mt-5 h-1 w-48 bg-[var(--cloud)] load-bar" />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto border-t border-[var(--rule-soft)] bg-white">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead className="mono bg-[var(--cloud)] text-[11px] uppercase text-[var(--muted-copy)]">
          <tr>
            <th className="border-b border-[var(--rule-soft)] px-4 py-3 font-medium">
              User ID
            </th>
            <th className="border-b border-[var(--rule-soft)] px-4 py-3 font-medium">
              Email
            </th>
            <th className="border-b border-[var(--rule-soft)] px-4 py-3 font-medium">
              Signed up
            </th>
            <th className="border-b border-[var(--rule-soft)] px-4 py-3 font-medium">
              Activated
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="step-in">
              <td className="mono border-b border-[var(--rule-soft)] px-4 py-3 text-xs">
                {row.id}
              </td>
              <td className="border-b border-[var(--rule-soft)] px-4 py-3">
                {row.email}
              </td>
              <td className="mono border-b border-[var(--rule-soft)] px-4 py-3 text-xs text-[var(--muted-copy)]">
                {formatDate(row.signed_up_at)}
              </td>
              <td className="border-b border-[var(--rule-soft)] px-4 py-3">
                <span className="mono inline-flex h-6 items-center border border-[var(--rule-soft)] bg-[var(--bone)] px-2 text-[11px] uppercase">
                  false
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
