import QRCode from "qrcode";
import { BoothStage } from "@/components/booth/BoothStage";
import { getHighlightedBoothSnippets } from "@/lib/highlight";

/** Where the recap's QR code sends visitors. Override per event. */
const CTA_URL =
  process.env.NEXT_PUBLIC_BOOTH_CTA_URL?.trim() || "https://www.inngest.com/docs";

export default async function Home() {
  const [snippets, qrSvg] = await Promise.all([
    getHighlightedBoothSnippets(),
    QRCode.toString(CTA_URL, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#1a161c", light: "#ffffff" },
    }),
  ]);

  return <BoothStage snippets={snippets} qrSvg={qrSvg} ctaUrl={CTA_URL} />;
}
