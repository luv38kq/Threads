"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { verifyPassphrase } from "@/lib/crypto";
import {
  emailSchema,
  fieldErrors,
  formValues,
  loginSchema,
  newPasswordSchema,
  safeNextPath,
  signupSchema,
  type FormState,
} from "@/lib/validation";

// 画面に入力値を戻すとき、パスワードや合言葉は戻さない
function withoutSecrets(values: Record<string, string>) {
  const rest = { ...values };
  delete rest.password;
  delete rest.confirm;
  delete rest.passphrase;
  return rest;
}

function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return "このメールアドレスは既に登録されています。ログインしてください。";
    case "weak_password":
      return "パスワードが簡単すぎます。英数字を組み合わせた長めのパスワードにしてください。";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "短時間に操作が集中しています。しばらく待ってからもう一度お試しください。";
    case "email_address_invalid":
      return "このメールアドレスは使用できません。";
    case "signup_disabled":
      return "現在、新規登録を受け付けていません。";
    case "invalid_credentials":
      return "メールアドレスかパスワードが違います。";
    case "email_not_confirmed":
      return "メールアドレスの確認が済んでいません。届いた確認メールのリンクを開いてください。";
    default:
      return "エラーが発生しました。時間をおいてもう一度お試しください。";
  }
}

// ---------------------------------------------------------------------
// 会員登録
// ---------------------------------------------------------------------
export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: withoutSecrets(values) };
  }
  const input = parsed.data;

  // 1. 合言葉の確認（合言葉は管理画面で設定したものと照合する）
  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("app_settings")
    .select("signup_passphrase_hash")
    .eq("id", true)
    .single();
  if (settingsError) {
    console.error("[signup] settings", settingsError.message);
    return { message: authErrorMessage(undefined), values: withoutSecrets(values) };
  }
  if (!settings.signup_passphrase_hash) {
    return { message: "現在、新規登録を受け付けていません。", values: withoutSecrets(values) };
  }
  const passphraseOk = await verifyPassphrase(input.passphrase, settings.signup_passphrase_hash);
  if (!passphraseOk) {
    return {
      errors: { passphrase: "合言葉が違います。購入した記事に書かれている合言葉を入力してください。" },
      values: withoutSecrets(values),
    };
  }

  // 2. 会員登録（この時点では「承認待ち」）
  const supabase = await createClient();
  const { siteUrl } = publicEnv();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { display_name: input.displayName, brain_name: input.brainName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/pending`,
    },
  });
  if (error) {
    return { message: authErrorMessage(error.code), values: withoutSecrets(values) };
  }
  // 登録済みのメールアドレスの場合、Supabase は identities が空のユーザーを返す
  if (!data.user || data.user.identities?.length === 0) {
    return { message: authErrorMessage("user_already_exists"), values: withoutSecrets(values) };
  }

  // 3. 「正しい合言葉で登録した人」の印を付ける（管理画面の承認判断に使う）
  const { error: markError } = await admin
    .from("profiles")
    .update({ passphrase_verified: true })
    .eq("id", data.user.id);
  if (markError) console.error("[signup] mark passphrase", markError.message);

  if (data.session) redirect("/pending");
  return {
    ok: true,
    message:
      "確認メールを送りました。メール内のリンクを開いて登録を完了してください。その後、管理者の承認をお待ちください。",
  };
}

// ---------------------------------------------------------------------
// ログイン・ログアウト
// ---------------------------------------------------------------------
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: withoutSecrets(values) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { message: authErrorMessage(error.code), values: withoutSecrets(values) };
  }
  redirect(safeNextPath(values.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------
// パスワード再設定
// ---------------------------------------------------------------------
export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const parsed = emailSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { siteUrl } = publicEnv();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error && error.code?.startsWith("over_")) {
    return { message: authErrorMessage(error.code), values };
  }
  // 登録の有無を他人に知られないよう、結果に関係なく同じ案内を出す
  return {
    ok: true,
    message:
      "登録済みのメールアドレスであれば、パスワード再設定用のメールを送りました。メール内のリンクを開いてください。",
  };
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { message: "リンクの有効期限が切れています。もう一度再設定メールを送ってください。" };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: authErrorMessage(error.code) };
  redirect("/dashboard");
}
