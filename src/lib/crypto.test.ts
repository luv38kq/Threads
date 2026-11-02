import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashPassphrase,
  keyHint,
  toBase64,
  verifyPassphrase,
} from "./crypto";

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)));
const OTHER_KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)));

describe("APIキーの暗号化", () => {
  it("暗号化したものを同じ鍵・同じ持ち主で元に戻せる", async () => {
    const encrypted = await encryptSecret("sk-ant-secret-1234", KEY, "user-a:anthropic");
    expect(encrypted).not.toContain("secret");
    expect(await decryptSecret(encrypted, KEY, "user-a:anthropic")).toBe("sk-ant-secret-1234");
  });

  it("同じ値でも毎回ちがう暗号文になる", async () => {
    const a = await encryptSecret("same", KEY, "ctx");
    const b = await encryptSecret("same", KEY, "ctx");
    expect(a).not.toBe(b);
  });

  it("別の利用者の行にコピーされた暗号文は復号できない", async () => {
    const encrypted = await encryptSecret("sk-secret", KEY, "user-a:openai");
    await expect(decryptSecret(encrypted, KEY, "user-b:openai")).rejects.toThrow();
  });

  it("鍵が違うと復号できない", async () => {
    const encrypted = await encryptSecret("sk-secret", KEY, "ctx");
    await expect(decryptSecret(encrypted, OTHER_KEY, "ctx")).rejects.toThrow();
  });

  it("改ざんされた暗号文は復号できない", async () => {
    const encrypted = await encryptSecret("sk-secret", KEY, "ctx");
    const [v, iv, data] = encrypted.split(":");
    const tampered = `${v}:${iv}:${data.slice(0, -4)}AAAA`;
    await expect(decryptSecret(tampered, KEY, "ctx")).rejects.toThrow();
  });

  it("鍵の長さが正しくなければ分かりやすいエラーになる", async () => {
    await expect(encryptSecret("x", toBase64(new Uint8Array(16)), "ctx")).rejects.toThrow(
      /32バイト/,
    );
  });

  it("画面表示用には末尾4文字だけを使う", () => {
    expect(keyHint("  sk-ant-abcdefgh1234 ")).toBe("1234");
  });
});

describe("登録用の合言葉", () => {
  it("正しい合言葉だけが一致する", async () => {
    const hash = await hashPassphrase("threads-2026");
    expect(hash).not.toContain("threads-2026");
    expect(await verifyPassphrase("threads-2026", hash)).toBe(true);
    expect(await verifyPassphrase("threads-2025", hash)).toBe(false);
  });

  it("全角・半角の違いは同じものとして扱う", async () => {
    const hash = await hashPassphrase("ＡＢＣ１２３");
    expect(await verifyPassphrase("ABC123", hash)).toBe(true);
  });

  it("壊れた保存値では一致しない", async () => {
    expect(await verifyPassphrase("x", "broken")).toBe(false);
  });
});
