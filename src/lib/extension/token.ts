import { toBase64 } from "@/lib/crypto";

// 拡張機能の連携コード。コードそのものは利用者に1回だけ見せ、
// データベースには SHA-256 のハッシュだけを保存します。

export const TOKEN_PREFIX = "tsx_";

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64url = toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${TOKEN_PREFIX}${base64url}`;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function looksLikeToken(value: string): boolean {
  return /^tsx_[A-Za-z0-9_-]{40,60}$/.test(value);
}

/** "Authorization: Bearer tsx_..." から連携コードを取り出す */
export function tokenFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  return looksLikeToken(match[1]) ? match[1] : null;
}
