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
        transformers: [highlightLines(snippet.highlightTerms ?? [])],
      }),
    }))
  );
}

function highlightLines(terms: string[]): ShikiTransformer {
  return {
    name: "demo-highlight-lines",
    line(hast) {
      const line = hastToText(hast);

      if (terms.some((term) => line.includes(term))) {
        this.addClassToHast(hast, "code-line-highlight");
      }
    },
  };
}

type HastLike = {
  type?: string;
  value?: unknown;
  children?: HastLike[];
};

function hastToText(node: HastLike): string {
  if (typeof node.value === "string") {
    return node.value;
  }

  return (node.children ?? []).map(hastToText).join("");
}
