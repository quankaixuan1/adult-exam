#!/bin/zsh
set -e
cd "$(dirname "$0")/admin"

RUNTIME_BIN="/Users/lele/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
if command -v pnpm >/dev/null 2>&1; then
  PNPM_BIN="$(command -v pnpm)"
elif [[ -x "$RUNTIME_BIN/pnpm" ]]; then
  PNPM_BIN="$RUNTIME_BIN/pnpm"
  export PATH="$RUNTIME_BIN:$PATH"
else
  echo '未找到 pnpm。请先安装 Node.js，再执行：corepack enable'
  read '?按回车退出'
  exit 1
fi

"$PNPM_BIN" install
"$PNPM_BIN" build
echo '构建完成：admin/dist'
read '?按回车退出'
