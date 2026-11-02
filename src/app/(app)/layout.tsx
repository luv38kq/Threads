import Link from "next/link";
import { requireActiveUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "ホーム" },
  { href: "/accounts", label: "アカウント" },
  { href: "/settings/ai", label: "AI設定" },
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // 承認済みの利用者以外はここで止める（未承認なら「承認待ち」画面へ）
  const profile = await requireActiveUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-bold tracking-tight">
            Threads 投稿スタジオ
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {item.label}
              </Link>
            ))}
            {profile.is_admin && (
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-zinc-800"
              >
                管理者
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{profile.display_name || profile.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="px-2 py-1">
                ログアウト
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
