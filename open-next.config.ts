// Cloudflare で Next.js を動かすための設定。
// このアプリは毎回サーバーで画面を作るので、有料になりうる R2 キャッシュは使いません。
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
