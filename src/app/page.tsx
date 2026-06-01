import { QueryConsole } from "@/components/demo/QueryConsole";
import { getHighlightedCodeSnippets } from "@/lib/highlight";

export default async function Home() {
  const snippets = await getHighlightedCodeSnippets();

  return <QueryConsole snippets={snippets} />;
}
