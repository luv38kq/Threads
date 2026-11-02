import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "パスワード再設定" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <h1 className="mb-2 text-xl font-bold">パスワード再設定</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        登録したメールアドレスに、再設定用のリンクをお送りします。
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="underline">
          ログイン画面に戻る
        </Link>
      </p>
    </Card>
  );
}
