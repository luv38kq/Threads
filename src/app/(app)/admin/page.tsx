import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, Card, Input, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserStatus } from "@/lib/supabase/database.types";
import { closeSignup } from "./actions";
import { MemberForm, PassphraseForm } from "./forms";

export const metadata: Metadata = { title: "管理者" };

const TABS: { key: UserStatus | "all"; label: string }[] = [
  { key: "pending", label: "承認待ち" },
  { key: "approved", label: "利用中" },
  { key: "suspended", label: "停止中" },
  { key: "all", label: "すべて" },
];

const STATUS_BADGE: Record<UserStatus, { tone: "warning" | "success" | "error"; label: string }> = {
  pending: { tone: "warning", label: "承認待ち" },
  approved: { tone: "success", label: "利用中" },
  suspended: { tone: "error", label: "停止中" },
};

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.status)?.key ?? "pending";
  // 検索語から、検索条件の書き方として特別な意味を持つ記号を取り除く
  const q = typeof params.q === "string" ? params.q.replace(/[,()%*\\]/g, "").trim().slice(0, 100) : "";

  const supabase = createAdminClient();

  let query = supabase
    .from("profiles")
    .select(
      "id, email, display_name, brain_name, status, is_admin, passphrase_verified, access_expires_at, admin_note, approved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (tab !== "all") query = query.eq("status", tab);
  if (q) query = query.or(`email.ilike.%${q}%,brain_name.ilike.%${q}%,display_name.ilike.%${q}%`);

  const [{ data: members, error }, { data: settings }, { count: pendingCount }] = await Promise.all([
    query,
    supabase.from("app_settings").select("signup_passphrase_hash, updated_at").eq("id", true).single(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (error) throw new Error(error.message);

  const signupOpen = Boolean(settings?.signup_passphrase_hash);

  return (
    <div className="space-y-8">
      <PageHeader title="管理者メニュー" description="購入者の承認・停止・利用期限と、登録用の合言葉を管理します。" />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">登録用の合言葉</h2>
          {signupOpen ? <Badge tone="success">受付中</Badge> : <Badge tone="error">受付停止中</Badge>}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Brainの記事の購入者向け部分に、この合言葉と登録ページのURLを書いてください。合言葉は安全のため元に戻せない形で保存しているので、ここには表示されません。
          {settings?.updated_at && <> 最終更新：{formatDate(settings.updated_at)}</>}
        </p>
        {!signupOpen && (
          <Alert tone="warning">合言葉が未設定のため、現在だれも新規登録できません。</Alert>
        )}
        <PassphraseForm />
        {signupOpen && (
          <form action={closeSignup}>
            <SubmitButton
              variant="ghost"
              className="text-xs text-red-600"
              confirmMessage="新規登録の受付を停止しますか？（合言葉を設定し直すと再開します）"
            >
              新規登録の受付を停止する
            </SubmitButton>
          </form>
        )}
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={{ pathname: "/admin", query: { status: t.key, ...(q ? { q } : {}) } }}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  t.key === tab
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {t.label}
                {t.key === "pending" && pendingCount ? `（${pendingCount}）` : ""}
              </Link>
            ))}
          </nav>
          <form className="flex gap-2" action="/admin">
            <input type="hidden" name="status" value={tab} />
            <Input name="q" defaultValue={q} placeholder="メール・Brain名で検索" className="w-56" />
            <Button type="submit" variant="secondary">
              検索
            </Button>
          </form>
        </div>

        {members.length === 0 ? (
          <Card className="text-center text-sm text-zinc-500">該当する利用者はいません。</Card>
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <Card key={`${m.id}-${m.status}-${m.access_expires_at}-${m.admin_note}`} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.display_name || "（名前なし）"}</span>
                      <Badge tone={STATUS_BADGE[m.status].tone}>{STATUS_BADGE[m.status].label}</Badge>
                      {m.is_admin && <Badge tone="info">管理者</Badge>}
                      {m.passphrase_verified ? (
                        <Badge tone="success">合言葉OK</Badge>
                      ) : (
                        <Badge tone="error">合言葉なし（要注意）</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{m.email}</p>
                    <p className="text-sm">
                      Brainのユーザー名：<span className="font-medium">{m.brain_name || "—"}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p>登録：{formatDate(m.created_at)}</p>
                    {m.approved_at && <p>承認：{formatDate(m.approved_at)}</p>}
                  </div>
                </div>
                <MemberForm
                  member={{
                    id: m.id,
                    status: m.status,
                    accessExpiresAt: m.access_expires_at,
                    adminNote: m.admin_note,
                  }}
                />
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
