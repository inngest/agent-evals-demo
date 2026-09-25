import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";

export const metadata: Metadata = {
  title: "Inngest Booth Demo | Unbreakable agents, invisible infra.",
  description:
    "An AI support agent on Inngest: it survives an outage, shows every step it took, and gets better through A/B testing.",
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
