import { z } from "zod";

// 入力チェックのルールをここにまとめています。
// 画面（ブラウザ）とサーバーの両方で同じルールを使えるようにしています。

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label}は${max}文字以内で入力してください` });

export const signupSchema = z.object({
  email: z.email({ error: "メールアドレスの形式が正しくありません" }),
  password: z
    .string()
    .min(8, { error: "パスワードは8文字以上にしてください" })
    .max(72, { error: "パスワードは72文字以内にしてください" }),
  displayName: text(50, "お名前").min(1, { error: "お名前を入力してください" }),
  brainName: text(100, "Brainのユーザー名").min(1, {
    error: "購入確認のため、Brainのユーザー名を入力してください",
  }),
  passphrase: z.string().trim().min(1, { error: "合言葉を入力してください" }).max(200),
});

export const loginSchema = z.object({
  email: z.email({ error: "メールアドレスの形式が正しくありません" }),
  password: z.string().min(1, { error: "パスワードを入力してください" }),
});

export const emailSchema = z.object({
  email: z.email({ error: "メールアドレスの形式が正しくありません" }),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { error: "パスワードは8文字以上にしてください" })
      .max(72, { error: "パスワードは72文字以内にしてください" }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    error: "確認用のパスワードが一致しません",
    path: ["confirm"],
  });

/** 改行区切りのテキストを、空行と重複を除いたリストにする */
export function linesToList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

export const accountSchema = z.object({
  name: text(50, "アカウント名").min(1, { error: "アカウント名を入力してください" }),
  threadsUsername: text(50, "Threadsのユーザー名").transform((v) => v.replace(/^@/, "")),
  profileSummary: text(1000, "アカウントの概要"),
  targetAudience: text(2000, "ターゲット"),
  goal: text(1000, "誘導したい先"),
  writingStyle: text(3000, "文章のクセ"),
  styleSamples: text(10000, "過去の投稿の見本"),
  bannedExpressions: z
    .string()
    .transform(linesToList)
    .pipe(
      z
        .array(z.string().max(100, { error: "禁止表現は1行100文字以内にしてください" }))
        .max(200, { error: "禁止表現は200個までです" }),
    ),
  customRules: text(3000, "その他のルール"),
});

export const knowledgeSchema = z.object({
  title: text(100, "タイトル").min(1, { error: "タイトルを入力してください" }),
  content: text(10000, "内容").min(1, { error: "内容を入力してください" }),
});

export const apiKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(10, { error: "APIキーが短すぎます。すべてコピーできているか確認してください" })
    .max(500, { error: "APIキーが長すぎます" })
    .regex(/^[\x21-\x7e]+$/, { error: "APIキーに使えない文字（空白や全角文字など）が含まれています" }),
});

export const passphraseSchema = z.object({
  passphrase: z
    .string()
    .trim()
    .min(6, { error: "合言葉は6文字以上にしてください" })
    .max(200, { error: "合言葉は200文字以内にしてください" }),
});

// ---------- フォーム共通 ----------

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** zod のエラーを「項目名 → 最初のエラーメッセージ」の形にする */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/** ログイン後の移動先として安全な（このサイト内の）パスだけを許可する */
export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
