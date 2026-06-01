import { codeToHtml } from "shiki";
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
      }),
    }))
  );
}
