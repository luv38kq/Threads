"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassphrase } from "@/lib/crypto";
import type { UserStatus } from "@/lib/supabase/database.types";
import { fieldErrors, formValues, passphraseSchema, type FormState } from "@/lib/validation";

// 管理者専用の操作。どの処理も最初に requireAdmin() で管理者かを確認してから、
// 安全ルールを無視できる管理用の接続（createAdminClient）を使います。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: UserStatus[] = ["pending", "approved", "suspended"];

/** "2026-12-31" → その日の日本時間 23:59:59 */
function endOfDayJst(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T23:59:59+09:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export async function updateMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = formValues(formData);
  const userId = values.userId ?? "";
  const status = values.status as UserStatus;
  if (!UUID.test(userId) || !STATUSES.includes(status)) {
    return { message: "入力内容が正しくありません。" };
  }
  if (userId === admin.id && status !== "approved") {
    return { message: "自分自身を承認待ち・停止にはできません。" };
  }

  let accessExpiresAt: string | null = null;
  if (values.accessExpiresAt) {
    accessExpiresAt = endOfDayJst(values.accessExpiresAt);
    if (!accessExpiresAt) return { message: "利用期限の日付が正しくありません。" };
  }
  const adminNote = (values.adminNote ?? "").slice(0, 2000);

  const supabase = createAdminClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("approved_at")
    .eq("id", userId)
    .maybeSingle();
  if (readError || !current) return { message: "利用者が見つかりません。" };

  const { error } = await supabase
    .from("profiles")
    .update({
      status,
      access_expires_at: accessExpiresAt,
      admin_note: adminNote,
      approved_at:
        status === "approved" ? (current.approved_at ?? new Date().toISOString()) : current.approved_at,
    })
    .eq("id", userId);
  if (error) {
    console.error("[updateMember]", error.message);
    return { message: "保存できませんでした。" };
  }
  revalidatePath("/admin");
  return { ok: true, message: "保存しました。" };
}

export async function setSignupPassphrase(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = passphraseSchema.safeParse(formValues(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ signup_passphrase_hash: await hashPassphrase(parsed.data.passphrase) })
    .eq("id", true);
  if (error) {
    console.error("[setSignupPassphrase]", error.message);
    return { message: "保存できませんでした。" };
  }
  revalidatePath("/admin");
  return {
    ok: true,
    message: "合言葉を変更しました。Brainの記事に書いている合言葉も忘れずに書き換えてください。",
  };
}

export async function closeSignup() {
  await requireAdmin();
  const supabase = createAdminClient();
  await supabase.from("app_settings").update({ signup_passphrase_hash: null }).eq("id", true);
  revalidatePath("/admin");
}
