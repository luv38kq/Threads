import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import type { GenerationKind } from "@/lib/supabase/database.types";
import { KIND_LABELS, listHistory } from "./queries";
import { HistoryList } from "./recent";

export const metadata: Metadata = { title: "履歴" };

const KINDS = Object.keys(KIND_LABELS) as GenerationKind[];

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await requireActiveUser();
  const params = await searchParams;
  const kind = KINDS.find((k) => k === params.kind);
  const items = await listHistory({ kind, limit: 100 });

  const tabs: { key?: GenerationKind; label: string }[] = [
    { label: "すべて" },
    ...KINDS.map((k) => ({ key: k, label: KIND_LABELS[k] })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="履歴" description="AIで作った投稿案・分析・リライトの結果です（新しい順に100件）。" />
      <nav className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.key ? `/history?kind=${t.key}` : "/history"}
            className={`rounded-md px-3 py-1.5 text-sm ${
              t.key === kind
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <Card className="text-center text-sm text-zinc-500">まだ履歴はありません。</Card>
      ) : (
        <HistoryList items={items} />
      )}
    </div>
  );
}
