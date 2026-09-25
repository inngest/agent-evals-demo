import QRCode from "qrcode";
import { SupportConsole } from "@/components/booth/SupportConsole";
import {
  getHighlightedBoothSnippets,
  getHighlightedRefundScript,
} from "@/lib/highlight";

/** Where the inbox's QR code sends visitors. Override per event. */
const CTA_URL =
  process.env.NEXT_PUBLIC_BOOTH_CTA_URL?.trim() || "https://www.inngest.com/docs";

export default async function Home() {
  const [snippets, refundScriptHtml, qrSvg] = await Promise.all([
    getHighlightedBoothSnippets(),
    getHighlightedRefundScript(),
    QRCode.toString(CTA_URL, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#1a161c", light: "#ffffff" },
    }),
  ]);

  return (
    <SupportConsole
      snippets={snippets}
      refundScriptHtml={refundScriptHtml}
      qrSvg={qrSvg}
    />
  );
}
