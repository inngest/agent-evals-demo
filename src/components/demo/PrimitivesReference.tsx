"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import type { HighlightedPrimitiveCard } from "@/lib/highlight";

/**
 * The Primitives tab on the loop demo's code pane: the four core
 * primitives the demo runs on, in large type for booth legibility.
 */
export function PrimitivesReference({
  primitives,
}: {
  primitives: HighlightedPrimitiveCard[];
}) {
  const [fontSize, setFontSize] = React.useState(15);
  const canZoomOut = fontSize > 12;
  const canZoomIn = fontSize < 20;

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-[#17131a]">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Zoom primitives out"
          title="Zoom primitives out"
          disabled={!canZoomOut}
          onClick={() => setFontSize((current) => Math.max(12, current - 1))}
          className="code-zoom-button grid size-7 place-items-center disabled:pointer-events-none disabled:opacity-35"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom primitives in"
          title="Zoom primitives in"
          disabled={!canZoomIn}
          onClick={() => setFontSize((current) => Math.min(20, current + 1))}
          className="code-zoom-button grid size-7 place-items-center disabled:pointer-events-none disabled:opacity-35"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div
        className="code-html h-full min-h-0 min-w-0 overflow-auto bg-[#17131a] pt-4"
        style={
          {
            "--code-font-size": `${fontSize}px`,
          } as React.CSSProperties
        }
      >
        <div className="grid gap-4 pb-8 pr-14 pl-5">
          {primitives.map((primitive) => (
            <article
              key={primitive.id}
              className="grid gap-1.5 border border-white/12 bg-white/[0.03] p-4"
            >
              <h4 className="display text-[22px] leading-7 font-semibold text-[#f2eee8]">
                {primitive.name}
              </h4>
              <p className="max-w-2xl text-[15px] leading-6 text-[#c9c4ce]">
                {primitive.tagline}
              </p>
              <div
                className="code-html mt-1 overflow-x-auto border border-white/10 bg-black/30"
                style={
                  {
                    "--code-font-size": `${fontSize}px`,
                  } as React.CSSProperties
                }
              >
                <div dangerouslySetInnerHTML={{ __html: primitive.html }} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
