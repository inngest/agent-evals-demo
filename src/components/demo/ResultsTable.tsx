"use client";

import { Check, FileCode, FileText, Target, X } from "lucide-react";
import type { TriageResult } from "@/components/demo/types";

/**
 * The RCA + cited-files view (was the SQL ResultsTable). Renders the agent's
 * root-cause analysis markdown plus the list of cited files, each badged
 * against the incident's ground-truth fix files.
 */
export function ResultsTable({
  result,
  groundTruthFixFiles,
  isRunning,
}: {
  result: TriageResult | null;
  groundTruthFixFiles: string[];
  isRunning: boolean;
}) {
  if (!result) {
    return (
      <div className="grid h-full min-h-0 place-items-center overflow-hidden border-t border-[var(--rule-soft)] bg-white">
        <div className="max-w-sm text-center">
          <div className="display text-2xl font-medium">
            The RCA lands here.
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">
            Pick an incident and hit Investigate. The agent runs its tool loop
            through Inngest and posts a root-cause analysis with cited files.
          </p>
          {isRunning ? (
            <div className="mx-auto mt-5 h-1 w-48 bg-[var(--cloud)] load-bar" />
          ) : null}
        </div>
      </div>
    );
  }

  const truth = new Set(groundTruthFixFiles);

  return (
    <div className="grid h-full min-h-0 overflow-hidden border-t border-[var(--rule-soft)] bg-white lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-h-0 overflow-auto border-r border-[var(--rule-soft)] p-5">
        <div className="mono mb-3 flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
          <FileText className="size-3.5" />
          Root-cause analysis
        </div>
        <RcaMarkdown markdown={result.rca} />
      </section>

      <aside className="grid min-h-0 content-start gap-5 overflow-auto bg-[var(--bone)] p-5">
        <div>
          <div className="mono mb-3 flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
            <Target className="size-3.5" />
            Cited files
          </div>
          <ul className="grid gap-2">
            {result.citedFiles.map((file) => {
              const hit = truth.has(file);
              return (
                <li
                  key={file}
                  className="flex items-center justify-between gap-2 border border-[var(--rule-soft)] bg-white px-3 py-2"
                >
                  <span className="mono flex min-w-0 items-center gap-2 text-xs">
                    <FileCode className="size-3.5 shrink-0 text-[var(--coral)]" />
                    <span className="truncate">{file}</span>
                  </span>
                  <span
                    className={`mono inline-flex h-5 shrink-0 items-center gap-1 border px-1.5 text-[10px] uppercase ${
                      hit
                        ? "border-[var(--matcha)] bg-[var(--matcha)] text-white"
                        : "border-[var(--rule-soft)] bg-[var(--bone)] text-[var(--muted-copy)]"
                    }`}
                  >
                    {hit ? (
                      <Check className="size-3" />
                    ) : (
                      <X className="size-3" />
                    )}
                    {hit ? "match" : "miss"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <div className="mono mb-2 text-[11px] uppercase text-[var(--muted-copy)]">
            Ground-truth fix files
          </div>
          <ul className="grid gap-1.5">
            {groundTruthFixFiles.map((file) => (
              <li
                key={file}
                className="mono truncate text-xs text-[var(--muted-copy)]"
              >
                {file}
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-[var(--ink)] bg-white p-3">
          <div className="mono flex items-center justify-between text-[11px] uppercase">
            <span>localization score</span>
            <span className="tabnum text-[var(--coral)]">
              {result.localizationScore.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-copy)]">
            Jaccard overlap of cited files against the ground-truth fix files.
            The deferred outcome score in Act 2.
          </p>
        </div>
      </aside>
    </div>
  );
}

/**
 * Tiny, dependency-free markdown renderer for the canned RCA. Handles the
 * subset the corpus uses: headings, bold, inline code, and bullet lists.
 */
function RcaMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 grid list-disc gap-1 pl-5 text-sm leading-6">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) {
      flushList(`l-${index}`);
      blocks.push(
        <h3
          key={index}
          className="display mt-4 text-base font-semibold first:mt-0"
        >
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flushList(`l-${index}`);
      blocks.push(
        <h2
          key={index}
          className="display mt-4 text-lg font-semibold first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      flushList(`l-${index}`);
      blocks.push(
        <h2
          key={index}
          className="display mt-4 text-xl font-semibold first:mt-0"
        >
          {renderInline(line.slice(2))}
        </h2>
      );
    } else if (/^[-*] /.test(line)) {
      listBuffer.push(line.slice(2));
    } else if (line.length === 0) {
      flushList(`l-${index}`);
    } else {
      flushList(`l-${index}`);
      blocks.push(
        <p key={index} className="my-2 text-sm leading-6">
          {renderInline(line)}
        </p>
      );
    }
  });
  flushList("l-end");

  return <div>{blocks}</div>;
}

// Inline: **bold** and `code`.
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="mono rounded-sm bg-[var(--cloud)] px-1 py-0.5 text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
