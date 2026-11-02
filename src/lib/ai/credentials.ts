import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/server-env";
import { createClient } from "@/lib/supabase/server";
import type { AiProvider } from "@/lib/supabase/database.types";

// 暗号化のときに一緒に混ぜる「持ち主の印」。
// 暗号文を他人の行へコピーしても復号できなくなります。
function keyContext(userId: string, provider: AiProvider) {
  return `ai_credentials:${userId}:${provider}`;
}

export async function encryptApiKey(userId: string, provider: AiProvider, apiKey: string) {
  return encryptSecret(apiKey, serverEnv().encryptionKey, keyContext(userId, provider));
}

/**
 * ログイン中の利用者のAPIキーを取り出します（AI機能を使う直前だけ呼ぶ）。
 * 取り出したキーは画面に返したり、ログに出したりしないでください。
 */
export async function getApiKeyForCurrentUser(
  userId: string,
  provider: AiProvider,
): Promise<{ apiKey: string; model: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_credentials")
    .select("encrypted_key, model")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`APIキーの取得に失敗しました: ${error.message}`);
  if (!data) return null;
  const apiKey = await decryptSecret(
    data.encrypted_key,
    serverEnv().encryptionKey,
    keyContext(userId, provider),
  );
  return { apiKey, model: data.model };
}
