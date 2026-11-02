import { CopyButton } from "@/components/copy-button";
import { countChars, THREADS_MAX_CHARS } from "@/lib/posts/rules";

/** Threads風の見た目で、本文とコメント欄を表示する */
export function PostPreview({
  body,
  comments,
  maxBodyChars = THREADS_MAX_CHARS,
}: {
  body: string;
  comments: string[];
  maxBodyChars?: number;
}) {
  const all = [body, ...comments].join("\n\n---\n\n");
  return (
    <div className="space-y-3">
      <PostBlock label="本文" text={body} max={maxBodyChars} />
      {comments.map((c, i) => (
        <PostBlock key={i} label={`コメント${i + 1}`} text={c} max={THREADS_MAX_CHARS} indent />
      ))}
      {comments.length > 0 && (
        <div className="flex justify-end">
          <CopyButton text={all} label="本文とコメントをまとめてコピー" />
        </div>
      )}
    </div>
  );
}

function PostBlock({
  label,
  text,
  max,
  indent,
}: {
  label: string;
  text: string;
  max: number;
  indent?: boolean;
}) {
  const length = countChars(text);
  const over = length > max;
  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 ${
        indent ? "ml-6 border-l-4 border-l-zinc-300 dark:border-l-zinc-700" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${over ? "font-semibold text-red-600" : "text-zinc-500"}`}>
            {length} / {max}文字
          </span>
          <CopyButton text={text} />
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  );
}
