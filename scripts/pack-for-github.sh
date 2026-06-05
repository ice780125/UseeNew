#!/bin/bash
# 打包「可上传 GitHub」的源码（不含 node_modules / 密钥 / 明文账号）
# 用法: bash scripts/pack-for-github.sh
# 生成: Usee-github-upload.zip（约 26 个文件，远小于 100）

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/Usee-github-upload"
ZIP="$ROOT/Usee-github-upload.zip"

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

rsync -a \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'ACCOUNTS.local.md' \
  --exclude 'server/usage.json' \
  --exclude 'Usee-github-upload' \
  --exclude 'Usee-github-upload.zip' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  "$ROOT/" "$OUT/"

COUNT=$(find "$OUT" -type f | wc -l | tr -d ' ')
cd "$ROOT"
zip -rq "$ZIP" "$(basename "$OUT")"

echo "Done: $ZIP"
echo "Files inside: $COUNT (limit for web upload is often ~100; you are well under)"
