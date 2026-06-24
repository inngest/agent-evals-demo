import { codeToHtml, type ShikiTransformer } from "shiki";
import { codeSnippets, type CodeSnippet } from "@/content/code-snippets";

export type HighlightedCodeSnippet = CodeSnippet & {
  html: string;
};

export async function getHighlightedCodeSnippets(): Promise<
  HighlightedCodeSnippet[]
> {
  return Promise.all(
    codeSnippets.map(async (snippet) => ({
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
