import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * ログイン中の利用者として Supabase に接続します。
 * データベースの安全ルール（RLS）がそのまま効くので、本人のデータしか扱えません。
 * リクエストごとに新しく作る必要があります（使い回し禁止）。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 画面表示中（Server Component）は cookie を書けないため無視します。
          // ログイン状態の更新は proxy.ts が毎回行っているので問題ありません。
        }
      },
    },
  });
}
