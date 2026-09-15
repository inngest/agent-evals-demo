import { codeToHtml, type ShikiTransformer } from "shiki";
import {
  loopSnippets,
  type LoopSnippet,
} from "@/content/loop-snippets";
import {
  primitiveCards,
  type PrimitiveCard,
} from "@/content/primitives-reference";

// Any snippet shape the CodeView can render. Legacy CodeSnippet (act ids)
// and LoopSnippet (stage ids) both satisfy this structurally.
export type AnySnippet = {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

export type HighlightedLoopSnippet = LoopSnippet & {
  html: string;
};

export type HighlightedPrimitiveCard = PrimitiveCard & {
  html: string;
};

export async function getHighlightedLoopSnippets(): Promise<
  HighlightedLoopSnippet[]
> {
  return highlightSnippets<LoopSnippet>(loopSnippets);
}

export async function getHighlightedPrimitives(): Promise<
  HighlightedPrimitiveCard[]
> {
  return highlightSnippets<PrimitiveCard>(primitiveCards);
}

async function highlightSnippets<T extends { code: string }>(
  snippets: T[]
): Promise<Array<T & { html: string }>> {
  return Promise.all(
    snippets.map(async (snippet) => ({
      ...snippet,
      html: await codeToHtml(snippet.code, {
        lang: "ts",
        theme: "github-dark",
        transformers: [highlightMarkedLines()],
      }),
    }))
  );
}

const highlightStart = "// @demo-highlight-start";
const highlightEnd = "// @demo-highlight-end";
const highlightLine = "// @demo-highlight-line";

function highlightMarkedLines(): ShikiTransformer {
  const highlightedLines = new Set<number>();

  return {
    name: "demo-highlight-lines",
    preprocess(code) {
      let isHighlighting = false;
      let outputLine = 0;
      const output: string[] = [];

      for (const sourceLine of code.split("\n")) {
        if (sourceLine.includes(highlightStart)) {
          isHighlighting = true;
          continue;
        }

        if (sourceLine.includes(highlightEnd)) {
          isHighlighting = false;
          continue;
        }

        const hasLineMarker = sourceLine.includes(highlightLine);
        outputLine += 1;
        output.push(sourceLine.replace(highlightLine, "").trimEnd());

        if (isHighlighting || hasLineMarker) {
          highlightedLines.add(outputLine);
        }
      }

      return output.join("\n");
    },
    line(hast, line) {
      if (highlightedLines.has(line)) {
        this.addClassToHast(hast, "code-line-highlight");
      }
    },
  };
}
