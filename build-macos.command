#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先从 https://nodejs.org 安装 Node.js 20 或更高版本。"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 npm，请重新安装 Node.js。"
  exit 1
fi

npm install
npm run build:renderer
npx electron-builder --mac --universal

echo "构建完成。macOS Universal 安装包位于 release 目录。"
