import Link from "next/link";
import { Badge, Card, formatDate } from "@/components/ui";
import type { GenerationKind } from "@/lib/supabase/database.types";
import { KIND_LABELS, KIND_PATHS, listHistory } from "./queries";

/** 最近の履歴（各機能のページの下に表示） */
export async function RecentHistory({ kind, limit = 5 }: { kind?: GenerationKind; limit?: number }) {
  const items = await listHistory({ kind, limit });
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">最近の履歴</h2>
        <Link href={kind ? `/history?kind=${kind}` : "/history"} className="text-sm underline">
          すべて見る
        </Link>
      </div>
      <HistoryList items={items} />
    </section>
  );
}

export function HistoryList({ items }: { items: Awaited<ReturnType<typeof listHistory>> }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`${KIND_PATHS[item.kind]}/${item.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Badge tone="info">{KIND_LABELS[item.kind]}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{item.summary || "（内容なし）"}</span>
              {item.accountName && <span className="text-xs text-zinc-500">{item.accountName}</span>}
              <span className="text-xs text-zinc-400">{formatDate(item.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
