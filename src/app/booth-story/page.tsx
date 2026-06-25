import { BoothStory } from "@/components/demo/BoothStory";
import { getHighlightedCodeSnippets } from "@/lib/highlight";
import { getScoreHistory } from "@/lib/scoring";

export const metadata = {
  title: "Agent Story",
};

export default async function BoothStoryPage() {
  const [snippets, initialHistory] = await Promise.all([
    getHighlightedCodeSnippets(),
    getScoreHistory(),
  ]);

  return <BoothStory snippets={snippets} initialHistory={initialHistory} />;
}
