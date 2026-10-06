#!/bin/bash
# 一键启动前后端开发服务
# 前端 http://localhost:5173 · 后端 http://127.0.0.1:8000
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 启动后端(FastAPI + KataGo)"
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
.venv/bin/uvicorn app.main:app --port 8000 &
BACK_PID=$!

echo "==> 启动前端(Vite)"
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  npm install
fi
npx vite --port 5173 &
FRONT_PID=$!

trap "kill $BACK_PID $FRONT_PID 2>/dev/null" EXIT
echo ""
echo "前端: http://localhost:5173 (浏览器打开)"
echo "后端: http://127.0.0.1:8000/api/health (查看引擎状态)"
echo "Ctrl+C 退出"
wait
