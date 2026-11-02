import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-lg font-bold tracking-tight">
        Threads 投稿スタジオ
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
