import * as React from "react";
import { Code2 } from "lucide-react";
import type { HighlightedBoothSnippet } from "@/lib/highlight";

/**
 * The "Under the hood" drawer: the code behind the screen on the left,
 * highlighted on the server with shiki. Only open when the driver presses U,
 * so a business visitor never sees code unless they ask.
 */
export function UnderTheHood({
  snippet,
  compact = false,
}: {
  snippet: HighlightedBoothSnippet;
  /** Portrait: the drawer sits under the thread, so it is shorter. */
  compact?: boolean;
}) {
  return (
    <aside className="booth-drawer grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[#17131a] text-white">
      <header
        className={`grid gap-2 border-b border-white/15 ${compact ? "px-8 pb-4 pt-5" : "px-10 pb-6 pt-12"}`}
      >
        <div className="mono flex items-center gap-2 text-[18px] uppercase tracking-[0.08em] text-[var(--coral-soft)]">
          <Code2 className="size-5" /> Under the hood · {snippet.eyebrow}
        </div>
        <div className={`display font-semibold ${compact ? "text-[28px]" : "text-[34px]"}`}>
          {snippet.label}
        </div>
        {compact ? null : (
          <p className="text-[21px] leading-[1.4] text-white/70">{snippet.description}</p>
        )}
      </header>
      <div
        className={`code-html min-h-0 ${compact ? "overflow-auto" : "overflow-hidden"}`}
        style={{ "--code-font-size": compact ? "17px" : "19px" } as React.CSSProperties}
      >
        <div dangerouslySetInnerHTML={{ __html: snippet.html }} />
      </div>
    </aside>
  );
}
