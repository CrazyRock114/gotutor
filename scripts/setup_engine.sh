#!/bin/bash
# Gotutor 引擎环境安装脚本(macOS + Apple Silicon)
# 安装 KataGo(Homebrew, Metal 后端)并下载 b18c384 网络权重(约 93MB)
set -e

MODEL_URL="https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz"
MODEL_PATH="$(cd "$(dirname "$0")/.." && pwd)/backend/models/kata1-b18c384nbt.bin.gz"

echo "==> 1/3 安装 KataGo(Homebrew)"
if command -v katago >/dev/null 2>&1; then
  echo "    已安装:$(katago version 2>/dev/null | head -1)"
else
  brew install katago
fi

echo "==> 2/3 下载网络权重"
if [ -f "$MODEL_PATH" ]; then
  echo "    已存在:$MODEL_PATH"
else
  mkdir -p "$(dirname "$MODEL_PATH")"
  curl -L --fail --progress-bar -o "$MODEL_PATH" "$MODEL_URL"
fi

echo "==> 3/3 验证"
katago version | head -2
ls -lh "$MODEL_PATH"
echo "完成。启动服务:./scripts/dev.sh"
