"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">エラーが発生しました</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        時間をおいて、もう一度お試しください。何度も続く場合は管理者にお知らせください。
      </p>
      <Button variant="secondary" onClick={() => reset()}>
        もう一度読み込む
      </Button>
    </main>
  );
}
