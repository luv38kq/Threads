import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ほぼ全ページがログイン中のユーザーごとに内容が変わるため、
  // 事前生成（Cache Components）は使わず、毎回サーバーで作る従来方式にしています。
  images: {
    // Cloudflare の有料画像変換を使わないための設定
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
