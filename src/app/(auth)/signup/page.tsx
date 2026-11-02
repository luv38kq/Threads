import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "新規登録" };

export default function SignupPage() {
  return (
    <Card>
      <h1 className="mb-2 text-xl font-bold">新規登録</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        ご購入いただいた記事に記載の「合言葉」が必要です。登録後、管理者が購入を確認して承認すると使えるようになります。
      </p>
      <SignupForm />
      <p className="mt-6 text-center text-sm">
        登録済みの方は{" "}
        <Link href="/login" className="font-medium underline">
          ログイン
        </Link>
      </p>
    </Card>
  );
}
