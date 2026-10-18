#!/bin/zsh
set -e
cd "$(dirname "$0")/../.."
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN="/Users/lele/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$NODE_BIN" ]]; then
  echo '请先安装 Node.js 24，再重新启动。'
  read '?按回车退出'
  exit 1
fi
if [[ ! -d node_modules/express ]]; then
  echo '依赖尚未安装，请在项目目录运行 pnpm install 或 npm install。'
  read '?按回车退出'
  exit 1
fi
"$NODE_BIN" archive/local-backend/local-server/start.js
