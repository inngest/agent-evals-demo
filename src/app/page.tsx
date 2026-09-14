import { LoopDemo } from "@/components/demo/LoopDemo";
import {
  getHighlightedLoopSnippets,
  getHighlightedPrimitives,
} from "@/lib/highlight";

export default async function Home() {
  const [snippets, primitives] = await Promise.all([
    getHighlightedLoopSnippets(),
    getHighlightedPrimitives(),
  ]);

  return <LoopDemo snippets={snippets} primitives={primitives} />;
}
