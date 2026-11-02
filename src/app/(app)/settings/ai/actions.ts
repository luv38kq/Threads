"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptApiKey } from "@/lib/ai/credentials";
import { isProvider, pickDefaultModel, PROVIDERS } from "@/lib/ai/providers";
import { verifyApiKey } from "@/lib/ai/verify-key";
import { keyHint } from "@/lib/crypto";
import { apiKeySchema, fieldErrors, type FormState } from "@/lib/validation";

export async function saveApiKey(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const provider = formData.get("provider");
  if (!isProvider(provider)) return { message: "AIの種類が正しくありません。" };

  const parsed = apiKeySchema.safeParse({ apiKey: formData.get("apiKey") ?? "" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const apiKey = parsed.data.apiKey;

  // 1. 本当に使えるキーかを確認（料金はかかりません）
  const result = await verifyApiKey(provider, apiKey);
  if (!result.ok) return { errors: { apiKey: result.message } };
  if (result.models.length === 0) {
    return {
      errors: {
        apiKey: `このキーで使える文章生成用のモデルが見つかりませんでした。${PROVIDERS[provider].company} の管理画面で設定を確認してください。`,
      },
    };
  }

  // 2. 暗号化して保存
  const supabase = await createClient();
  const { error } = await supabase.from("ai_credentials").upsert(
    {
      user_id: profile.id,
      provider,
      encrypted_key: await encryptApiKey(profile.id, provider, apiKey),
      key_hint: keyHint(apiKey),
      model: pickDefaultModel(provider, result.models),
      available_models: result.models,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) {
    console.error("[saveApiKey]", error.message);
    return { message: "保存できませんでした。もう一度お試しください。" };
  }

  // 初めて登録したAIは「普段使うAI」にする
  if (!profile.preferred_ai_provider) {
    await supabase
      .from("profiles")
      .update({ preferred_ai_provider: provider })
      .eq("id", profile.id);
  }

  revalidatePath("/settings/ai");
  return { ok: true, message: "接続を確認して保存しました。" };
}

export async function updateModel(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const provider = formData.get("provider");
  const model = String(formData.get("model") ?? "");
  if (!isProvider(provider)) return { message: "AIの種類が正しくありません。" };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("ai_credentials")
    .select("available_models")
    .eq("user_id", profile.id)
    .eq("provider", provider)
    .maybeSingle();
  if (!current?.available_models.includes(model)) {
    return { message: "選べないモデルです。キーを登録し直すと一覧が更新されます。" };
  }

  const { error } = await supabase
    .from("ai_credentials")
    .update({ model })
    .eq("user_id", profile.id)
    .eq("provider", provider);
  if (error) return { message: "保存できませんでした。" };
  revalidatePath("/settings/ai");
  return { ok: true, message: "モデルを変更しました。" };
}

export async function deleteApiKey(formData: FormData) {
  const profile = await requireActiveUser();
  const provider = formData.get("provider");
  if (!isProvider(provider)) return;

  const supabase = await createClient();
  await supabase
    .from("ai_credentials")
    .delete()
    .eq("user_id", profile.id)
    .eq("provider", provider);

  if (profile.preferred_ai_provider === provider) {
    await supabase
      .from("profiles")
      .update({ preferred_ai_provider: null })
      .eq("id", profile.id);
  }
  revalidatePath("/settings/ai");
}

export async function setPreferredProvider(formData: FormData) {
  const profile = await requireActiveUser();
  const provider = formData.get("provider");
  if (!isProvider(provider)) return;
  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ preferred_ai_provider: provider })
    .eq("id", profile.id);
  revalidatePath("/settings/ai");
}
