"use client";

import * as React from "react";
import { Code2, Minus, Plus } from "lucide-react";
import type { HighlightedCodeSnippet } from "@/lib/highlight";

export function CodeView({
  snippets,
  activeId: controlledId,
}: {
  snippets: HighlightedCodeSnippet[];
  // Optional: let the shell sync the visible snippet to the current act.
  activeId?: HighlightedCodeSnippet["id"];
}) {
  const [internalId, setInternalId] = React.useState<
    HighlightedCodeSnippet["id"]
  >(snippets[0]?.id);
  const activeId = controlledId ?? internalId;
  const setActiveId = setInternalId;
  const [codeFontSize, setCodeFontSize] = React.useState(15);
  const active = snippets.find((snippet) => snippet.id === activeId) ?? snippets[0];
  const canZoomOut = codeFontSize > 12;
  const canZoomIn = codeFontSize < 20;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white">
      <div className="grid gap-3 border-b border-[var(--rule-soft)] p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
            <Code2 className="size-3.5" />
            Curated code
          </div>
          <div className="display mt-1 text-xl font-medium">
            {active.eyebrow}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted-copy)]">
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
            <div className="flex flex-wrap gap-2">
              {snippets.map((snippet) => (
                <button
                  key={snippet.id}
                  type="button"
                  onClick={() => setActiveId(snippet.id)}
                  data-active={activeId === snippet.id}
                  className="demo-segment-button mono h-9 min-w-20 px-3 text-center text-[11px] uppercase"
                >
                  {snippet.label}
                </button>
              ))}
            </div>
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
