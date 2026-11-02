import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { safeNextPath } from "@/lib/validation";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const linkError = params.error === "link";

  return (
    <Card>
      <h1 className="mb-6 text-xl font-bold">ログイン</h1>
      {linkError && (
        <div className="mb-4">
          <Alert tone="error">
            リンクが無効か、有効期限が切れています。もう一度お試しください。
          </Alert>
        </div>
      )}
      <LoginForm next={next} />
      <div className="mt-6 space-y-2 text-center text-sm">
        <p>
          <Link href="/forgot-password" className="underline">
            パスワードを忘れた方
          </Link>
        </p>
        <p>
          はじめての方は{" "}
          <Link href="/signup" className="font-medium underline">
            新規登録
          </Link>
        </p>
      </div>
    </Card>
  );
}
