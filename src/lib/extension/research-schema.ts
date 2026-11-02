import { z } from "zod";

// 拡張機能から送られてくる投稿データの形（これ以外の形は受け付けない）

const text = z.string().max(5000);

export const researchPostSchema = z.object({
  code: z.string().min(1).max(100),
  url: z.url().max(500).refine((u) => /^https:\/\/(www\.)?threads\.(com|net)\//.test(u), {
    error: "Threads のURLではありません",
  }),
  username: z.string().min(1).max(100),
  text,
  likeCount: z.number().int().min(0).max(1e9),
  replyCount: z.number().int().min(0).max(1e9),
  repostCount: z.number().int().min(0).max(1e9),
  quoteCount: z.number().int().min(0).max(1e9),
  takenAt: z.iso.datetime(),
  mediaType: z.enum(["text", "image", "video", "carousel"]),
  replyToUsername: z.string().max(100).nullable(),
  tree: z.array(z.object({ code: z.string().max(100), text })).max(30),
});

export type ResearchPost = z.infer<typeof researchPostSchema>;

export const researchUploadSchema = z.object({
  sourceUsername: z.string().max(100).nullable(),
  sourceUrl: z.string().max(2000),
  accountId: z.uuid().nullable(),
  posts: z.array(researchPostSchema).min(1, { error: "投稿が1件もありません" }).max(300, {
    error: "一度に送れるのは300件までです",
  }),
});

export type ResearchUpload = z.infer<typeof researchUploadSchema>;
