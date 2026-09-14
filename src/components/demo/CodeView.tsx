"use client";

import * as React from "react";
import { Code2, Minus, Plus } from "lucide-react";
import type { AnySnippet } from "@/lib/highlight";

type Highlighted<T extends AnySnippet> = T & { html: string };

export function CodeView({
  snippets,
  activeId: controlledId,
  variant = "full",
  defaultFontSize,
}: {
  snippets: Array<Highlighted<AnySnippet>>;
  // Optional: let the shell sync the visible snippet to the current act/stage.
  activeId?: string;
  variant?: "full" | "rail" | "minimal";
  // Optional: override the starting zoom level (booth legibility).
  defaultFontSize?: number;
}) {
  const [internalId, setInternalId] = React.useState<string | undefined>(
    snippets[0]?.id
  );
  const isControlled = controlledId !== undefined;
  const activeId = controlledId ?? internalId;
  const [codeFontSize, setCodeFontSize] = React.useState(
    defaultFontSize ?? (variant === "rail" || variant === "minimal" ? 13 : 15)
  );
  const active = snippets.find((snippet) => snippet.id === activeId) ?? snippets[0];
  const canZoomOut = codeFontSize > 12;
  const canZoomIn = codeFontSize < 20;
  const showPicker = variant === "full" && !isControlled;
  const isMinimal = variant === "minimal";

  if (!active) {
    return null;
  }

  if (isMinimal) {
    return (
      <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-[#17131a]">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom code out"
            title="Zoom code out"
            disabled={!canZoomOut}
            onClick={() =>
              setCodeFontSize((current) => Math.max(12, current - 1))
            }
            className="code-zoom-button grid size-7 place-items-center disabled:pointer-events-none disabled:opacity-35"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom code in"
            title="Zoom code in"
            disabled={!canZoomIn}
            onClick={() =>
              setCodeFontSize((current) => Math.min(20, current + 1))
            }
            className="code-zoom-button grid size-7 place-items-center disabled:pointer-events-none disabled:opacity-35"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div
          className="code-html h-full min-h-0 min-w-0 overflow-auto bg-[#17131a] pt-9"
          style={
            {
              "--code-font-size": `${codeFontSize}px`,
            } as React.CSSProperties
          }
        >
          <div dangerouslySetInnerHTML={{ __html: active.html }} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white">
      <div
        className={
          variant === "rail"
            ? "grid gap-3 border-b border-[var(--rule-soft)] p-4"
            : "grid gap-3 border-b border-[var(--rule-soft)] p-4 lg:grid-cols-[220px_minmax(0,1fr)]"
        }
      >
        <div>
          <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
            <Code2 className="size-3.5" />
            Curated code
          </div>
          <div
            className={
              variant === "rail"
                ? "display mt-1 text-lg font-medium"
                : "display mt-1 text-xl font-medium"
            }
          >
            {active.eyebrow}
          </div>
        </div>
        <div
          className={
            variant === "rail"
              ? "grid min-w-0 gap-3"
              : "flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
          }
        >
          <p
            className={
              variant === "rail"
                ? "text-xs leading-5 text-[var(--muted-copy)]"
                : "max-w-2xl text-sm leading-6 text-[var(--muted-copy)]"
            }
          >
            {active.description}
          </p>
          <div className="flex shrink-0 flex-wrap items-start gap-3">
            <div className="grid grid-cols-[36px_56px_36px] gap-2">
              <button
                type="button"
                aria-label="Zoom code out"
                title="Zoom code out"
                disabled={!canZoomOut}
                onClick={() =>
                  setCodeFontSize((current) => Math.max(12, current - 1))
                }
                className="demo-segment-button grid h-9 w-9 place-items-center disabled:pointer-events-none disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <div className="mono grid h-9 place-items-center border border-[var(--ink)] bg-white text-[11px] tabnum">
                {codeFontSize}px
              </div>
              <button
                type="button"
                aria-label="Zoom code in"
                title="Zoom code in"
                disabled={!canZoomIn}
                onClick={() =>
                  setCodeFontSize((current) => Math.min(20, current + 1))
                }
                className="demo-segment-button grid h-9 w-9 place-items-center disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {showPicker ? (
              <div className="flex flex-wrap gap-2">
                {snippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    onClick={() => setInternalId(snippet.id)}
                    data-active={activeId === snippet.id ? "true" : undefined}
                    className="demo-segment-button mono h-9 min-w-20 px-3 text-center text-[11px] uppercase"
                  >
                    {snippet.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className="code-html min-h-0 overflow-auto bg-[#17131a]"
        style={
          {
            "--code-font-size": `${codeFontSize}px`,
          } as React.CSSProperties
        }
      >
        <div dangerouslySetInnerHTML={{ __html: active.html }} />
      </div>
    </div>
  );
}
