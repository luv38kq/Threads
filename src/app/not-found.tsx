import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        URLが間違っているか、ページが削除された可能性があります。
      </p>
      <ButtonLink href="/dashboard" variant="secondary">
        ホームに戻る
      </ButtonLink>
    </main>
  );
}
