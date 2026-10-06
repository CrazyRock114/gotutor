#!/usr/bin/env python3
"""用 KataGo GTP 自弈生成示例棋谱(版权干净,可随项目分发)。

用法:backend/.venv/bin/python scripts/gen_demo.py [visits] [max_moves]
输出:backend/demo/game.sgf
"""
import subprocess
import sys
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KATAGO = "/opt/homebrew/bin/katago"
MODEL = ROOT / "backend" / "models" / "kata1-b18c384nbt.bin.gz"
CFG = ROOT / "scripts" / "gen_demo.cfg"
OUT = ROOT / "backend" / "demo" / "game.sgf"

VISITS = int(sys.argv[1]) if len(sys.argv) > 1 else 80
MAX_MOVES = int(sys.argv[2]) if len(sys.argv) > 2 else 140

GTP_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ"


def gtp_to_sgf(vertex: str, size: int = 19) -> str:
    if vertex.lower() == "pass":
        return ""
    col = GTP_LETTERS.index(vertex[0].upper())
    row = int(vertex[1:]) - 1  # 0 = 底行
    sgf_col = chr(ord("a") + col)
    sgf_row = chr(ord("a") + (size - 1 - row))
    return sgf_col + sgf_row


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        [KATAGO, "gtp", "-config", str(CFG), "-model", str(MODEL)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )

    def cmd(line: str) -> str:
        proc.stdin.write(line + "\n")
        proc.stdin.flush()
        out = []
        while True:
            l = proc.stdout.readline()
            if not l:  # EOF:引擎退出
                break
            if l.startswith("=") or l.startswith("?"):
                out.append(l.rstrip("\n"))
                continue
            if l.strip() == "" and out:
                break
            if l.strip() == "":
                continue
            out.append(l.rstrip("\n"))
        return "".join(out)[1:].strip()

    cmd("boardsize 19")
    cmd("komi 7.5")
    cmd("clear_board")

    sgf_moves = []
    color = "B"
    passes = 0
    while len(sgf_moves) < MAX_MOVES and passes < 2:
        resp = cmd(f"genmove {color}")
        if proc.poll() is not None:
            print("引擎退出,终止生成", flush=True)
            sys.exit(1)
        vertex = resp.split()[0] if resp.strip() else "pass"
        if vertex.lower() in ("pass", "resign"):
            passes += 1
            sgf_moves.append(f";{color}[]")
        else:
            passes = 0
            sgf_moves.append(f";{color}[{gtp_to_sgf(vertex)}]")
        print(f"{len(sgf_moves):3d} {color} {vertex}", flush=True)
        color = "W" if color == "B" else "B"

    try:
        score = cmd("final_score")
    except Exception:
        score = ""
    cmd("quit")
    proc.wait()

    today = datetime.date.today().isoformat()
    re_ = f"RE[{score}]" if score and not score.startswith("?") else ""
    sgf = (
        f"(;GM[1]FF[4]CA[UTF-8]SZ[19]KM[7.5]RU[Chinese]DT[{today}]PB[KataGo b18(黑)]"
        f"PW[KataGo b18(白)]{re_}C[Gotutor 演示棋谱 — KataGo v1.18.2 b18c384nbt 自弈,"
        f"每手 {VISITS} visits,公有领域可用];{''.join(sgf_moves)})"
    )
    OUT.write_text(sgf, encoding="utf-8")
    print(f"\n已写入 {OUT}({len(sgf_moves)} 手,score={score})")


if __name__ == "__main__":
    main()
