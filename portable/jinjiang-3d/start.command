#!/bin/sh
# macOS：双击运行；Linux：在终端执行 ./start.command
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。请先安装 Node.js 18 或更高版本：https://nodejs.org/"
  printf "按回车键退出..."
  read -r _
  exit 1
fi
exec node server.mjs
