// 暗号化まわりの処理。Cloudflare でも Node.js でも動く標準機能（Web Crypto）だけを使います。
//
// - encryptSecret / decryptSecret: 利用者のAPIキーを AES-256-GCM で暗号化・復号する
// - hashPassphrase / verifyPassphrase: 登録用の合言葉を元に戻せない形（PBKDF2）で保存・照合する

const VERSION = "v1";
// Cloudflare Workers の PBKDF2 は 100,000 回が上限
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64(base64Key);
  } catch {
    throw new Error("ENCRYPTION_KEY が正しい形式（Base64）ではありません。");
  }
  if (raw.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY は32バイトの値をBase64にしたものを設定してください。",
    );
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * 秘密の文字列を暗号化します。
 * context（例: 利用者ID と AIの種類）を一緒に渡すと、暗号文を別の利用者の行に
 * コピーしても復号できなくなります（すり替え対策）。
 */
export async function encryptSecret(
  plainText: string,
  base64Key: string,
  context: string,
): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    key,
    encoder.encode(plainText),
  );
  return `${VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(
  payload: string,
  base64Key: string,
  context: string,
): Promise<string> {
  const [version, ivPart, dataPart] = payload.split(":");
  if (version !== VERSION || !ivPart || !dataPart) {
    throw new Error("暗号化データの形式が正しくありません。");
  }
  const key = await importAesKey(base64Key);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(ivPart),
      additionalData: encoder.encode(context),
    },
    key,
    fromBase64(dataPart),
  );
  return decoder.decode(plain);
}

async function pbkdf2(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(passphrase, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassphrase(
  passphrase: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterText, saltPart, hashPart] = stored.split("$");
  const iterations = Number(iterText);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || !saltPart || !hashPart) {
    return false;
  }
  const expected = fromBase64(hashPart);
  const actual = await pbkdf2(passphrase, fromBase64(saltPart), iterations);
  return timingSafeEqual(expected, actual);
}

// 比較にかかる時間から答えを推測されないよう、常に全部を比べる
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 画面に出す用：APIキーの末尾4文字だけ */
export function keyHint(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
