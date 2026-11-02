import { NextResponse } from "next/server";
import { authenticateExtension, jsonError } from "@/lib/extension/auth";
import { researchUploadSchema } from "@/lib/extension/research-schema";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 3 * 1024 * 1024;

/** 拡張機能から、集めた競合投稿を受け取って保存する */
export async function POST(request: Request) {
  const auth = await authenticateExtension(request);
  if ("response" in auth) return auth.response;

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return jsonError(413, "データが大きすぎます。件数を減らして送ってください。");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonError(400, "データの形式が正しくありません。");
  }
  const parsed = researchUploadSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, `データの形式が正しくありません：${parsed.error.issues[0]?.message ?? ""}`);
  }
  const upload = parsed.data;

  const supabase = createAdminClient();
  // 管理用の接続のため、持ち主（user_id）は必ずここで指定する。
  // アカウントIDが他人のものなら、データベースの紐づけルールで保存が失敗する。
  const { data, error } = await supabase
    .from("research_sets")
    .insert({
      user_id: auth.user.userId,
      account_id: upload.accountId,
      source_username: upload.sourceUsername ?? "",
      source_url: upload.sourceUrl,
      posts: upload.posts,
      post_count: upload.posts.length,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[extension/research]", error.message);
    return jsonError(400, "保存できませんでした。アカウントを選び直してもう一度お試しください。");
  }

  const url = new URL(`/research/${data.id}`, request.url).toString();
  return NextResponse.json({ ok: true, id: data.id, url });
}
