import "server-only";
import { NextResponse } from "next/server";
import { accessState } from "@/lib/auth-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, tokenFromHeader } from "./token";

// 拡張機能からのリクエストを、連携コードで本人確認します。
// 拡張機能はスタジオのログイン状態（cookie）を使わないため、ここでは
// 管理用の接続（createAdminClient）を使い、必ず user_id で絞り込みます。

export type ExtensionUser = { userId: string; displayName: string };

export function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function authenticateExtension(
  request: Request,
): Promise<{ user: ExtensionUser } | { response: NextResponse }> {
  const token = tokenFromHeader(request.headers.get("authorization"));
  if (!token) {
    return { response: jsonError(401, "連携コードが正しくありません。スタジオで発行したコードを入れ直してください。") };
  }

  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from("extension_tokens")
    .select("id, user_id")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!tokenRow) {
    return { response: jsonError(401, "連携コードが無効です（削除された可能性があります）。スタジオで新しいコードを発行してください。") };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, status, access_expires_at")
    .eq("id", tokenRow.user_id)
    .maybeSingle();
  if (!profile || accessState(profile) !== "active") {
    return { response: jsonError(403, "承認されていないか、利用期限が切れています。スタジオにログインして状態を確認してください。") };
  }

  // 最終利用日時を記録（失敗しても処理は続ける）
  await supabase
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return { user: { userId: tokenRow.user_id, displayName: profile.display_name } };
}
