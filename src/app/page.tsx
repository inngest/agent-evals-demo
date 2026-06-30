import { ResearchDemo } from "@/components/demo/ResearchDemo";
import { getHighlightedCodeSnippets } from "@/lib/highlight";

export default async function Home() {
  const snippets = await getHighlightedCodeSnippets();

  return <ResearchDemo snippets={snippets} />;
}
