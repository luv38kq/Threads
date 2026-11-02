import { NextResponse } from "next/server";
import { authenticateExtension } from "@/lib/extension/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 拡張機能が「承認済みの購入者として使えるか」を確認する */
export async function POST(request: Request) {
  const auth = await authenticateExtension(request);
  if ("response" in auth) return auth.response;

  const supabase = createAdminClient();
  const { data: accounts } = await supabase
    .from("managed_accounts")
    .select("id, name")
    .eq("user_id", auth.user.userId)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ok: true,
    displayName: auth.user.displayName,
    accounts: accounts ?? [],
  });
}
