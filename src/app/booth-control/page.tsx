import { BoothControlPanel } from "@/components/demo/BoothControlPanel";
import { getHighlightedCodeSnippets } from "@/lib/highlight";
import { getScoreHistory } from "@/lib/scoring";

export const metadata = {
  title: "Booth Control",
};

export default async function BoothControlPage() {
  const [snippets, initialHistory] = await Promise.all([
    getHighlightedCodeSnippets(),
    getScoreHistory(),
  ]);

  return (
    <BoothControlPanel snippets={snippets} initialHistory={initialHistory} />
  );
}
