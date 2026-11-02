import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Threads 投稿スタジオ",
    template: "%s | Threads 投稿スタジオ",
  },
  description: "Threads の投稿作成・分析・改善をAIで支援するツール",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
