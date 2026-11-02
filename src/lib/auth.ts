import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AiProvider, UserStatus } from "@/lib/supabase/database.types";
import { accessState } from "@/lib/auth-state";

export { accessState };

// 本人が見てよい会員情報だけ（管理者メモなどは含めない）
export type CurrentProfile = {
  id: string;
  email: string;
  display_name: string;
  brain_name: string;
  status: UserStatus;
  is_admin: boolean;
  access_expires_at: string | null;
  preferred_ai_provider: AiProvider | null;
};

const PROFILE_COLUMNS =
  "id, email, display_name, brain_name, status, is_admin, access_expires_at, preferred_ai_provider";

/**
 * ログイン中の利用者の会員情報を返します（未ログインなら null）。
 * 1回の画面表示の中では結果を使い回します。
 */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`会員情報の取得に失敗しました: ${error.message}`);
  return data;
});

/** ログインしていなければログイン画面へ移動します */
export async function requireUser(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** 承認済み・期限内の利用者でなければ「承認待ち」画面へ移動します */
export async function requireActiveUser(): Promise<CurrentProfile> {
  const profile = await requireUser();
  if (accessState(profile) !== "active") redirect("/pending");
  return profile;
}

/** 管理者でなければ「ページが見つかりません」を表示します（管理画面の存在を隠すため） */
export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await requireUser();
  if (!profile.is_admin) notFound();
  return profile;
}
