import QRCode from "qrcode";
import { SupportConsole } from "@/components/booth/SupportConsole";
import {
  getHighlightedBoothSnippets,
  getHighlightedLinkCheckScript,
} from "@/lib/highlight";

/** Where the inbox's QR code sends visitors. Override per event. */
const CTA_URL =
  process.env.NEXT_PUBLIC_BOOTH_CTA_URL?.trim() || "https://www.inngest.com/docs";

export default async function Home() {
  const [snippets, linkScriptHtml, qrSvg] = await Promise.all([
    getHighlightedBoothSnippets(),
    getHighlightedLinkCheckScript(),
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
      linkScriptHtml={linkScriptHtml}
      qrSvg={qrSvg}
    />
  );
}
