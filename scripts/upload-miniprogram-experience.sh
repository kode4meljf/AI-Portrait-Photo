#!/usr/bin/env bash
# 静默上传小程序体验版：依赖本机微信开发者工具后台 Daemon，无需前置打开 IDE 窗口
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/miniprogram"
CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
INFO_OUT="$ROOT/tmp/upload-info.json"
VERSION="1"
DESC="AI写真馆体验版更新 (@$(date '+%Y-%m-%d %H:%M'))"

if [[ ! -x "$CLI" ]]; then
  echo "未找到微信开发者工具 CLI：$CLI" >&2
  exit 1
fi

if [[ ! -f "$PROJECT/project.config.json" ]]; then
  echo "未找到小程序项目：$PROJECT" >&2
  exit 1
fi

mkdir -p "$ROOT/tmp"

echo "项目：$PROJECT"
echo "版本：$VERSION"
echo "说明：$DESC"
echo ""

echo "开始上传..."
"$CLI" upload \
  --project "$PROJECT" \
  --version "$VERSION" \
  --desc "$DESC" \
  --info-output "$INFO_OUT" \
  --lang zh

echo ""
echo "上传完成：v${VERSION}"
if [[ -f "$INFO_OUT" ]]; then
  echo "详情：$INFO_OUT"
fi
