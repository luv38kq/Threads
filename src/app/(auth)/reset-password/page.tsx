import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "新しいパスワード" };

export default async function ResetPasswordPage() {
  // 再設定メールのリンクから来た人だけが表示できる（リンクを開くとログイン状態になる）
  await requireUser();

  return (
    <Card>
      <h1 className="mb-6 text-xl font-bold">新しいパスワードを設定</h1>
      <ResetPasswordForm />
    </Card>
  );
}
