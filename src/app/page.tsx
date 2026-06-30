import { BoothControlPanel } from "@/components/demo/BoothControlPanel";
import { getHighlightedCodeSnippets } from "@/lib/highlight";
import { getScoreHistory } from "@/lib/scoring";

export default async function Home() {
  const [snippets, initialHistory] = await Promise.all([
    getHighlightedCodeSnippets(),
    getScoreHistory(),
  ]);

  return (
    <BoothControlPanel snippets={snippets} initialHistory={initialHistory} />
  );
}
