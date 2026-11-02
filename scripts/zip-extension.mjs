// extension フォルダを zip にまとめて public/downloads に置きます。
// （アプリのビルド前に自動で実行され、購入者はスタジオからダウンロードできます）
// 追加のソフトを使わず、Node.js の標準機能だけで zip を作ります。

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "extension");
const outDir = join(root, "public", "downloads");
const outFile = join(outDir, "threads-research-extension.zip");

// 配布に含めないもの（テストなど）
const EXCLUDE = [/^test\//, /(^|\/)\./];

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const files = listFiles(source)
  .map((full) => ({ full, name: relative(source, full).split(sep).join("/") }))
  .filter(({ name }) => !EXCLUDE.some((re) => re.test(name)))
  .sort((a, b) => a.name.localeCompare(b.name));

const { time, day } = dosDateTime(new Date("2026-01-01T00:00:00"));
const localParts = [];
const centralParts = [];
let offset = 0;

for (const { full, name } of files) {
  const data = readFileSync(full);
  const compressed = deflateRawSync(data, { level: 9 });
  const nameBytes = Buffer.from(name, "utf8");
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 のファイル名
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  localParts.push(local, nameBytes, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, nameBytes);

  offset += local.length + nameBytes.length + compressed.length;
}

const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, Buffer.concat([...localParts, ...centralParts, end]));
console.log(`拡張機能をまとめました: ${relative(root, outFile)}（${files.length}ファイル）`);
