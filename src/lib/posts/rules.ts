// 投稿の文字数や禁止表現を、AI任せにせずプログラムで確認するための処理。

/** Threads の1投稿あたりの上限文字数 */
export const THREADS_MAX_CHARS = 500;

/**
 * 文字数を数える（絵文字なども1文字ずつ数える、やや厳しめの数え方）。
 * 改行も1文字として数えます。
 */
export function countChars(text: string): number {
  return [...text].length;
}

/** 文章に含まれている禁止表現の一覧を返す（大文字小文字・全角半角の違いは無視） */
export function findBannedExpressions(text: string, banned: string[]): string[] {
  const normalized = normalize(text);
  return banned.filter((word) => {
    const w = normalize(word);
    return w.length > 0 && normalized.includes(w);
  });
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

export type PostParts = { body: string; comments: string[] };

export type RuleViolation = {
  /** 何番目のパターンか（0始まり） */
  index: number;
  message: string;
};

/** 投稿（本文＋コメント）がルールを守っているかを確認し、守れていない点を返す */
export function checkPost(
  post: PostParts,
  rules: { maxBodyChars: number; bannedExpressions: string[] },
  index = 0,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const bodyLength = countChars(post.body);
  if (bodyLength > rules.maxBodyChars) {
    violations.push({
      index,
      message: `本文が${bodyLength}文字あります。${rules.maxBodyChars}文字以内にしてください。`,
    });
  }
  post.comments.forEach((comment, i) => {
    const length = countChars(comment);
    if (length > THREADS_MAX_CHARS) {
      violations.push({
        index,
        message: `コメント${i + 1}が${length}文字あります。${THREADS_MAX_CHARS}文字以内にしてください。`,
      });
    }
  });
  const banned = findBannedExpressions(
    [post.body, ...post.comments].join("\n"),
    rules.bannedExpressions,
  );
  if (banned.length > 0) {
    violations.push({
      index,
      message: `禁止表現「${banned.join("」「")}」が含まれています。別の言い方に変えてください。`,
    });
  }
  return violations;
}
