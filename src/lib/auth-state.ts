import type { UserStatus } from "@/lib/supabase/database.types";

export type AccessState = "active" | "pending" | "suspended" | "expired";

/** 利用者が今ツールを使える状態かどうか（データベースの is_active_user() と同じ判定） */
export function accessState(
  profile: { status: UserStatus; access_expires_at: string | null },
  now = new Date(),
): AccessState {
  if (profile.status === "pending") return "pending";
  if (profile.status === "suspended") return "suspended";
  if (profile.access_expires_at && new Date(profile.access_expires_at) <= now) {
    return "expired";
  }
  return "active";
}
