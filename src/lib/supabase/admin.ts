import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import type { Database } from "./database.types";

/**
 * 管理者用の「合鍵」で Supabase に接続します。安全ルール（RLS）を無視して
 * すべてのデータを扱えるため、次の場面でだけ使ってください。
 *   - 管理者画面の処理（必ず requireAdmin() で管理者か確認してから）
 *   - 会員登録時の合言葉チェック
 * 普段のデータ操作には lib/supabase/server.ts の createClient() を使います。
 */
export function createAdminClient() {
  const { supabaseUrl } = publicEnv();
  const { supabaseSecretKey } = serverEnv();
  return createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
