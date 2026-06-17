import { IncidentDemo } from "@/components/demo/IncidentDemo";
import { getHighlightedCodeSnippets } from "@/lib/highlight";

export default async function Home() {
  const snippets = await getHighlightedCodeSnippets();

  return <IncidentDemo snippets={snippets} />;
}
