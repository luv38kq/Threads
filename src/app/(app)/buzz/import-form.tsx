"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import {
  chunkPosts,
  normalizeBuzzJson,
  normalizeBuzzText,
  type NormalizeResult,
} from "@/lib/buzz/import";
import { finishBuzzImport, importBuzzChunk } from "./actions";

/** 一度に読み込めるファイルの大きさ（ブラウザ内で読むだけなので大きめでよい） */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

type Status = { tone: "info" | "success" | "warning" | "error"; text: string } | null;

export function BuzzImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [genre, setGenre] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  async function readInput(): Promise<NormalizeResult> {
    const defaults = { genre };
    if (mode === "text") return normalizeBuzzText(text, defaults);
    if (!file) throw new Error("ファイルを選んでください。");
    if (file.size > MAX_FILE_BYTES) throw new Error("ファイルが大きすぎます（30MBまで）。ジャンルごとに分けてください。");
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error("JSONとして読めませんでした。ファイルの形式を確認してください。");
    }
    return normalizeBuzzJson(data, defaults);
  }

  function submit() {
    startTransition(async () => {
      setStatus(null);
      let result: NormalizeResult;
      try {
        result = await readInput();
      } catch (error) {
        setStatus({ tone: "error", text: error instanceof Error ? error.message : "読み込みに失敗しました。" });
        return;
      }
      if (result.posts.length === 0) {
        setStatus({ tone: "error", text: "取り込める投稿が見つかりませんでした（本文が空の投稿は取り込みません）。" });
        return;
      }

      const parts = chunkPosts(result.posts);
      let inserted = 0;
      let sent = 0;
      for (let i = 0; i < parts.length; i++) {
        sent += parts[i].length;
        setStatus({ tone: "info", text: `取り込み中… ${sent} / ${result.posts.length}件` });
        const res = await importBuzzChunk(parts[i]);
        if (!res.ok) {
          setStatus({ tone: "error", text: `${res.message}（${inserted}件は取り込み済み）` });
          await finishBuzzImport();
          router.refresh();
          return;
        }
        inserted += res.inserted;
      }
      await finishBuzzImport();
      router.refresh();
      const already = result.posts.length - inserted;
      const notes = [
        already > 0 ? `${already}件は取り込み済みだったので飛ばしました` : "",
        result.duplicates > 0 ? `ファイル内の重複${result.duplicates}件を除きました` : "",
        result.skipped > 0 ? `本文のない${result.skipped}件を除きました` : "",
      ].filter(Boolean);
      setStatus({
        tone: "success",
        text: `${inserted}件を取り込みました。${notes.length ? `（${notes.join("／")}）` : ""}`,
      });
      setText("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">取り込む</h3>
        <div className="ml-auto flex gap-1 text-sm">
          <Button type="button" variant={mode === "file" ? "primary" : "secondary"} onClick={() => setMode("file")}>
            JSONファイル
          </Button>
          <Button type="button" variant={mode === "text" ? "primary" : "secondary"} onClick={() => setMode("text")}>
            テキストを貼り付け
          </Button>
        </div>
      </div>

      {mode === "file" ? (
        <Field
          label="JSONファイル"
          htmlFor="buzzFile"
          hint="スレハックの保存済み投稿を書き出したファイルや、text（本文）・likes（いいね数）・genre（ジャンル）を持つ投稿の配列に対応しています。同じ投稿は二重に取り込みません。"
        >
          <Input
            id="buzzFile"
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      ) : (
        <Field
          label="投稿の本文"
          htmlFor="buzzText"
          hint="投稿ごとに「---」だけの行で区切ってください。1行目を「いいね:320」にすると、いいね数として読み込みます。"
        >
          <Textarea
            id="buzzText"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"いいね:320\n1つ目の投稿の本文…\n---\nいいね:150\n2つ目の投稿の本文…"}
          />
        </Field>
      )}

      <Field
        label="ジャンル（任意）"
        htmlFor="buzzGenre"
        hint="データにジャンルがない投稿に付けます（例：育児・教育、トイトレ、声かけ）"
      >
        <Input id="buzzGenre" maxLength={50} value={genre} onChange={(e) => setGenre(e.target.value)} />
      </Field>

      {status && <Alert tone={status.tone}>{status.text}</Alert>}

      <Button type="button" onClick={submit} disabled={pending || (mode === "file" ? !file : !text.trim())}>
        {pending ? "取り込み中…" : "取り込む"}
      </Button>
    </div>
  );
}
