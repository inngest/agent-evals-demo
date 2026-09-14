import { ResearchDemo } from "@/components/demo/ResearchDemo";
import { getHighlightedCodeSnippets } from "@/lib/highlight";

export const metadata = {
  title: "Research Agent (legacy acts demo)",
};

export default async function ResearchPage() {
  const snippets = await getHighlightedCodeSnippets();

  return <ResearchDemo snippets={snippets} />;
}
