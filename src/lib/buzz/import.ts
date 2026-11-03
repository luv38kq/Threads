import { z } from "zod";

// ---------------------------------------------------------------------
// バズ投稿の取り込み：いろいろな形のデータを、決まった形（BuzzPostInput）にそろえる
//   - スレハックの検索結果・保存済み一覧（posts 配列、public_ref・likes・thread.replies など）
//   - 自分で作ったJSON（text・likes だけでもよい）
//   - 貼り付けたテキスト（「---」だけの行で投稿を区切る）
// 画面（ブラウザ）とサーバーの両方で使うため、ここでは外部の機能を使わない
// ---------------------------------------------------------------------

export const BUZZ_MAX_POSTS_PER_USER = 5000;
export const BUZZ_IMPORT_CHUNK = 200;
/** 1回に送るデータの大きさの目安（サーバーの受け取り上限 1MB より小さくする） */
export const BUZZ_IMPORT_CHUNK_BYTES = 600_000;

const TEXT_MAX = 5000;
const THREAD_ITEM_MAX = 2000;
const THREAD_MAX_ITEMS = 10;

export const buzzPostInputSchema = z.object({
  source_ref: z.string().min(1).max(200),
  genre: z.string().max(50),
  platform: z.enum(["threads", "x", "other"]),
  author: z.string().max(100),
  url: z.string().max(500),
  text: z.string().min(1).max(TEXT_MAX),
  thread: z.array(z.string().max(THREAD_ITEM_MAX)).max(THREAD_MAX_ITEMS),
  likes: z.number().int().min(0).max(2_000_000_000),
  replies: z.number().int().min(0).max(2_000_000_000),
  reposts: z.number().int().min(0).max(2_000_000_000),
  views: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  posted_at: z.iso.datetime({ offset: true }).nullable(),
});

export type BuzzPostInput = z.infer<typeof buzzPostInputSchema>;

export const buzzImportChunkSchema = z
  .array(buzzPostInputSchema)
  .min(1, { error: "投稿が1件もありません" })
  .max(BUZZ_IMPORT_CHUNK, { error: `一度に送れるのは${BUZZ_IMPORT_CHUNK}件までです` });

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function count(...values: unknown[]): number {
  for (const v of values) {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 2_000_000_000);
  }
  return 0;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** 本文から作る短い番号（同じ本文なら同じ番号になる。暗号用ではない） */
export function textFingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `txt:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function platformOf(value: unknown, url: string): BuzzPostInput["platform"] {
  const p = str(value).toLowerCase();
  if (p === "threads" || /threads\.(com|net)\//.test(url)) return "threads";
  if (p === "x" || p === "twitter" || /^https:\/\/(x|twitter)\.com\//.test(url)) return "x";
  return "other";
}

function safeUrl(value: unknown): string {
  const u = str(value).trim();
  return /^https?:\/\/\S+$/.test(u) && u.length <= 500 ? u : "";
}

function dateOf(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ツリーの続き：スレハック形式（thread.replies）・文字列の配列・{text} の配列に対応 */
function threadOf(item: Obj, author: string): string[] {
  let raw: unknown[] = [];
  if (isObj(item.thread) && Array.isArray(item.thread.replies)) raw = item.thread.replies;
  else if (Array.isArray(item.thread)) raw = item.thread;
  else if (Array.isArray(item.tree)) raw = item.tree;

  const texts: string[] = [];
  for (const r of raw) {
    if (typeof r === "string") {
      if (r.trim()) texts.push(r);
      continue;
    }
    if (!isObj(r)) continue;
    // 他人の返信は入れない（本人の続きの投稿だけ）
    const relation = str(r.relation);
    if (relation && relation !== "author_continuation") continue;
    const replyAuthor = str(r.author);
    if (author && replyAuthor && replyAuthor !== author) continue;
    const t = str(r.text);
    if (t.trim()) texts.push(t);
  }
  return texts.slice(0, THREAD_MAX_ITEMS).map((t) => clip(t.trim(), THREAD_ITEM_MAX));
}

/** 1件分をそろえる。本文がなければ null */
export function normalizeBuzzItem(item: unknown, defaults: { genre?: string } = {}): BuzzPostInput | null {
  if (!isObj(item)) return null;
  const text = clip(str(item.text ?? item.body).trim(), TEXT_MAX);
  if (!text) return null;

  const url = safeUrl(item.url);
  const author = clip(str(item.author ?? item.username).trim(), 100);
  const ref =
    str(item.public_ref).trim() ||
    str(item.source_ref).trim() ||
    str(item.ref).trim() ||
    url ||
    str(item.id).trim() ||
    textFingerprint(text);
  const genre = clip(str(item.genre).trim() || (defaults.genre ?? "").trim(), 50);

  return {
    source_ref: clip(ref, 200),
    genre,
    platform: platformOf(item.platform, url),
    author,
    url,
    text,
    thread: threadOf(item, author),
    likes: count(item.likes, item.like_count, item.likeCount),
    replies: count(item.replies, item.reply_count, item.replyCount),
    reposts: count(item.reposts, item.repost_count, item.repostCount),
    views: count(item.views, item.view_count, item.viewCount),
    posted_at: dateOf(item.posted_at ?? item.postedAt ?? item.takenAt),
  };
}

export type NormalizeResult = { posts: BuzzPostInput[]; skipped: number; duplicates: number };

function dedupe(items: (BuzzPostInput | null)[]): NormalizeResult {
  const seen = new Set<string>();
  const posts: BuzzPostInput[] = [];
  let skipped = 0;
  let duplicates = 0;
  for (const p of items) {
    if (!p) {
      skipped++;
      continue;
    }
    if (seen.has(p.source_ref)) {
      duplicates++;
      continue;
    }
    seen.add(p.source_ref);
    posts.push(p);
  }
  return { posts, skipped, duplicates };
}

/** JSONの中身をそろえる。配列そのもの・{ posts: [...] }・{ items: [...] } に対応 */
export function normalizeBuzzJson(data: unknown, defaults: { genre?: string } = {}): NormalizeResult {
  let list: unknown[] | null = null;
  if (Array.isArray(data)) list = data;
  else if (isObj(data) && Array.isArray(data.posts)) list = data.posts;
  else if (isObj(data) && Array.isArray(data.items)) list = data.items;
  if (!list) throw new Error("投稿の一覧が見つかりません。投稿の配列、または posts という項目を持つJSONを選んでください。");
  return dedupe(list.map((item) => normalizeBuzzItem(item, defaults)));
}

/**
 * 貼り付けたテキストをそろえる。「---」だけの行で投稿を区切る。
 * 投稿の最初の行が「いいね:123」「♡123」の形なら、いいね数として読む。
 */
export function normalizeBuzzText(raw: string, defaults: { genre?: string } = {}): NormalizeResult {
  const blocks = raw
    .replace(/\r\n?/g, "\n")
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  return dedupe(
    blocks.map((block) => {
      const lines = block.split("\n");
      const m = lines[0].match(/^(?:いいね|likes?|♡|❤️?)\s*[:：]?\s*([\d,]+)\s*$/i);
      const likes = m ? Number(m[1].replace(/,/g, "")) : 0;
      const text = (m ? lines.slice(1).join("\n") : block).trim();
      return normalizeBuzzItem({ text, likes }, defaults);
    }),
  );
}

/** 件数とデータの大きさの両方が上限を超えないように分ける */
export function chunkPosts<T>(
  items: T[],
  maxItems: number = BUZZ_IMPORT_CHUNK,
  maxBytes: number = BUZZ_IMPORT_CHUNK_BYTES,
): T[][] {
  const encoder = new TextEncoder();
  const out: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = encoder.encode(JSON.stringify(item)).length + 1;
    if (current.length > 0 && (current.length >= maxItems || bytes + size > maxBytes)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) out.push(current);
  return out;
}
