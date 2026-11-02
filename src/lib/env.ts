// 環境変数（秘密の設定値）を読み出す場所をここに集めています。
// 値が入っていないときは、何が足りないかが分かるエラーを出します。

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.example を参考に設定してください。`,
    );
  }
  return value;
}

// ブラウザにも送ってよい値（NEXT_PUBLIC_ で始まるもの）
// ※ Next.js の仕組み上、process.env.XXX と直接書く必要があります
export function publicEnv() {
  return {
    supabaseUrl: required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabasePublishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  };
}
