import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";

export const metadata: Metadata = {
  title: "Inngest Booth Demo | Unbreakable agents, invisible infra.",
  description:
    "Run, Observe, A/B Test: a real Inngest agent loop with durable steps, traces, insights, metrics, variants, and sandboxes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
