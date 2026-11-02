"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth";
import { generateToken, hashToken } from "@/lib/extension/token";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation";

const MAX_TOKENS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TokenFormState = FormState & { token?: string };

export async function createExtensionToken(
  _prev: TokenFormState,
  formData: FormData,
): Promise<TokenFormState> {
  const profile = await requireActiveUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 50) || "マイPC";

  const supabase = await createClient();
  const { count } = await supabase
    .from("extension_tokens")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_TOKENS) {
    return { message: `連携コードは${MAX_TOKENS}個までです。使っていないものを削除してください。` };
  }

  const token = generateToken();
  const { error } = await supabase.from("extension_tokens").insert({
    user_id: profile.id,
    name,
    token_hash: await hashToken(token),
    token_hint: token.slice(-4),
  });
  if (error) {
    console.error("[createExtensionToken]", error.message);
    return { message: "発行できませんでした。もう一度お試しください。" };
  }
  revalidatePath("/settings/extension");
  return { ok: true, token };
}

export async function deleteExtensionToken(formData: FormData) {
  await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("extension_tokens").delete().eq("id", id);
  revalidatePath("/settings/extension");
}
