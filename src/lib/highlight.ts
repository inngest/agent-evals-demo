import { codeToHtml, type ShikiTransformer } from "shiki";
import { boothSnippets, type BoothSnippet } from "@/content/booth-snippets";
import { refundScript } from "@/content/refund-sandbox";

// Any snippet shape the CodeView can render.
export type AnySnippet = {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

export type HighlightedBoothSnippet = BoothSnippet & {
  html: string;
};

export async function getHighlightedBoothSnippets(): Promise<
  HighlightedBoothSnippet[]
> {
  return highlightSnippets<BoothSnippet>(boothSnippets);
}

/** The sandbox panel's refund script, highlighted once on the server. */
export async function getHighlightedRefundScript(): Promise<string> {
  return codeToHtml(refundScript.trimEnd(), {
    lang: "python",
    theme: "github-dark",
  });
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
