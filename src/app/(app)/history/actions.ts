"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteHistory(formData: FormData) {
  await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("generations").delete().eq("id", id);
  if (error) console.error("[deleteHistory]", error.message);
  revalidatePath("/history");
  redirect("/history");
}
