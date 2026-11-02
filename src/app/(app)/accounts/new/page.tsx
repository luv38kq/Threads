import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { AccountForm } from "../account-form";

export const metadata: Metadata = { title: "新しいアカウント" };

export default async function NewAccountPage() {
  await requireActiveUser();
  return (
    <div>
      <PageHeader
        title="新しいアカウント"
        description="あとからいつでも変更できます。わかる項目だけ入力してください。"
      />
      <Card>
        <AccountForm />
      </Card>
    </div>
  );
}
