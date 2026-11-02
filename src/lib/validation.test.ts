import { describe, expect, it } from "vitest";
import { accountSchema, linesToList, safeNextPath, signupSchema } from "./validation";
import { accessState } from "./auth-state";

describe("ログイン後の移動先", () => {
  it("サイト内のパスだけを許可する", () => {
    expect(safeNextPath("/accounts/1")).toBe("/accounts/1");
    expect(safeNextPath("https://evil.example.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.example.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example.com")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });
});

describe("禁止表現の入力", () => {
  it("空行と重複を取り除いて1行ずつのリストにする", () => {
    expect(linesToList("絶対稼げる\n\n 誰でも簡単 \r\n絶対稼げる")).toEqual(["絶対稼げる", "誰でも簡単"]);
  });

  it("アカウント入力をデータベース用の形に変換する", () => {
    const parsed = accountSchema.parse({
      name: " 副業垢 ",
      threadsUsername: "@my_threads",
      profileSummary: "",
      targetAudience: "",
      goal: "",
      writingStyle: "",
      styleSamples: "",
      bannedExpressions: "A\nB",
      customRules: "",
    });
    expect(parsed.name).toBe("副業垢");
    expect(parsed.threadsUsername).toBe("my_threads");
    expect(parsed.bannedExpressions).toEqual(["A", "B"]);
  });
});

describe("会員登録の入力チェック", () => {
  const valid = {
    email: "user@example.com",
    password: "password123",
    displayName: "テスト",
    brainName: "brain_user",
    passphrase: "secret",
  };

  it("正しい入力は通る", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("短いパスワードは通らない", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("Brainのユーザー名は必須", () => {
    expect(signupSchema.safeParse({ ...valid, brainName: " " }).success).toBe(false);
  });
});

describe("利用できる状態かどうか", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  it("承認済み・期限なしなら利用可", () => {
    expect(accessState({ status: "approved", access_expires_at: null }, now)).toBe("active");
  });
  it("期限を過ぎたら期限切れ", () => {
    expect(accessState({ status: "approved", access_expires_at: "2026-11-01T00:00:00Z" }, now)).toBe("expired");
  });
  it("承認待ち・停止中は使えない", () => {
    expect(accessState({ status: "pending", access_expires_at: null }, now)).toBe("pending");
    expect(accessState({ status: "suspended", access_expires_at: null }, now)).toBe("suspended");
  });
});
