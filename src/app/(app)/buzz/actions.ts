"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buzzInputSchema, type BuzzSourcePost } from "@/lib/ai/prompts/buzz";
import { generateStructured } from "@/lib/ai/structured";
import { errorMessage, loadAccountWithKnowledge, requireApiKey } from "@/lib/ai/run";
import { BUZZ_MAX_POSTS_PER_USER, buzzImportChunkSchema } from "@/lib/buzz/import";
import { generateFromBuzz } from "@/lib/features/buzz";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

export type ImportChunkResult = { ok: true; inserted: number } | { ok: false; message: string };

/** 取り込み（画面から分割して送られてくる1回分）。中身はサーバーでも必ず確認する */
export async function importBuzzChunk(posts: unknown): Promise<ImportChunkResult> {
  await requireActiveUser();
  const parsed = buzzImportChunkSchema.safeParse(posts);
  if (!parsed.success) {
    return { ok: false, message: "取り込めない形のデータが含まれていました。ファイルの中身を確認してください。" };
  }

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("buzz_posts")
    .select("id", { count: "exact", head: true });
  if (countError) {
    console.error("[importBuzzChunk] count", countError.message);
    return { ok: false, message: "保存先の確認に失敗しました。データベースの準備（SQLの実行）が済んでいるか確認してください。" };
  }
  if ((count ?? 0) + parsed.data.length > BUZZ_MAX_POSTS_PER_USER) {
    return {
      ok: false,
      message: `ストックできるのは${BUZZ_MAX_POSTS_PER_USER.toLocaleString()}件までです（いま${(count ?? 0).toLocaleString()}件）。不要なジャンルを削除してから取り込んでください。`,
    };
  }

  const { data, error } = await supabase
    .from("buzz_posts")
    .upsert(parsed.data, { onConflict: "user_id,source_ref", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[importBuzzChunk] insert", error.message);
    return { ok: false, message: "保存に失敗しました。時間をおいてもう一度お試しください。" };
  }
  return { ok: true, inserted: data?.length ?? 0 };
}

export async function finishBuzzImport() {
  await requireActiveUser();
  revalidatePath("/buzz");
}

const ALL = "__all__";

export async function deleteBuzzGenre(formData: FormData) {
  await requireActiveUser();
  const genre = String(formData.get("genre") ?? "");
  if (genre.length > 50) return;
  const supabase = await createClient();
  // 安全ルール（RLS）により、本人の投稿しか削除されません
  const query = supabase.from("buzz_posts").delete();
  await (genre === ALL ? query.not("id", "is", null) : query.eq("genre", genre));
  revalidatePath("/buzz");
}

/** AIに渡す候補の最大件数（この中から反応の良い順に選ぶ） */
const CANDIDATE_LIMIT = 200;

export async function runBuzz(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const values = formValues(formData);
  const parsed = buzzInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values, message: "入力内容を確認してください。" };
  const input = parsed.data;

  let generationId: string;
  try {
    const supabase = await createClient();
    let query = supabase
      .from("buzz_posts")
      .select("text, thread, likes, replies, reposts, genre, platform")
      .order("likes", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (input.genre) query = query.eq("genre", input.genre);
    const { data: rows, error: rowsError } = await query;
    if (rowsError) {
      console.error("[runBuzz] load", rowsError.message);
      return { message: "バズ投稿の読み込みに失敗しました。", values };
    }
    if (!rows || rows.length < 3) {
      return { message: "このジャンルのバズ投稿が少なすぎます（3件以上必要です）。先に取り込んでください。", values };
    }
    const posts: BuzzSourcePost[] = rows.map((r) => ({
      ...r,
      thread: Array.isArray(r.thread) ? r.thread.filter((t): t is string => typeof t === "string") : [],
    }));

    const loaded = await loadAccountWithKnowledge(input.accountId);
    if (!loaded) return { message: "アカウントが見つかりません。", values };
    const { apiKey, model } = await requireApiKey(profile, input.provider);
    const call = { provider: input.provider, apiKey, model };

    const result = await generateFromBuzz(
      {
        analyze: (args) => generateStructured({ ...call, ...args, maxTokens: 32000 }),
        repair: (args) => generateStructured({ ...call, ...args }),
      },
      input,
      posts,
      loaded.account,
      loaded.knowledge,
    );

    const { data, error } = await supabase
      .from("generations")
      .insert({
        account_id: input.accountId,
        kind: "buzz",
        provider: input.provider,
        model,
        input: { ...input, label: `${input.genre || "全ジャンル"}のバズ投稿から量産${input.theme ? `：${input.theme}` : ""}` },
        output: result,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[runBuzz] save", error.message);
      return { message: "結果の保存に失敗しました。もう一度お試しください。", values };
    }
    generationId = data.id;
  } catch (error) {
    return { message: errorMessage(error), values };
  }
  redirect(`/buzz/${generationId}`);
}
