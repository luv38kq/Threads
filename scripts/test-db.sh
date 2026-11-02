#!/usr/bin/env bash
# データベースのテストを、使い捨ての PostgreSQL で実行します。
#   npm run test:db
# 必要なもの: PostgreSQL 15 以上（initdb / pg_ctl / psql）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.pgtest"
PORT="${PGTEST_PORT:-54329}"

PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"

# root では PostgreSQL を起動できないため、postgres ユーザーで動かす
run() {
  if [ "$(id -u)" = "0" ]; then
    su postgres -s /bin/bash -c "$*"
  else
    bash -c "$*"
  fi
}

cleanup() {
  run "'$PG_BIN/pg_ctl' -D '$WORK/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

rm -rf "$WORK"
mkdir -p "$WORK"
[ "$(id -u)" = "0" ] && chown -R postgres "$WORK"

run "'$PG_BIN/initdb' -D '$WORK/data' -U postgres -E UTF8 --locale=C.UTF-8 >/dev/null"
run "'$PG_BIN/pg_ctl' -D '$WORK/data' -o '-p $PORT -k $WORK -c listen_addresses=' -l '$WORK/log' -w start >/dev/null"

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "適用中: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do
  echo "テスト: $(basename "$f")"
  "${PSQL[@]}" -tA -f "$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^$/d'
done
