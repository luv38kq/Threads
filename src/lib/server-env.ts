import "server-only";

// サーバーだけで使う秘密の値。"server-only" により、
// 間違ってブラウザ側のコードから読み込むとビルドが失敗します。

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.example を参考に設定してください。`,
    );
  }
  return value;
}

export function serverEnv() {
  return {
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
    encryptionKey: required("ENCRYPTION_KEY"),
  };
}
