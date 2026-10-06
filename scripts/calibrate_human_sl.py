#!/usr/bin/env python3
"""human-SL 校准 harness(P0-3)。

对每个 profile 做 self-play(同一 profile 黑白对弈),输出量化指标:
  - 每档测试局数 / 黑胜率 / 白胜率 / 平均手数
  - pass 异常率(开局早期 pass 的局占比)
  - humanPolicy 采样使用率(证明走的是 humanPolicy 采样路径)
  - 引擎错误数
结果写入 backend/calibration/calibration_<时间戳>.json——以数据判断,不靠主观观感。

用法:
  cd backend && .venv/bin/python ../scripts/calibrate_human_sl.py --games 2 --size 9 --seed 2026
"""
import argparse
import asyncio
import json
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.engine import KataGoEngine
from app.play import PlaySession, RANK_PROFILES
from app.rules import default_komi

ROOT = Path(__file__).resolve().parent.parent


async def play_one(engine, size, rank, seed, max_moves, early_pass_move):
    """一局 self-play;返回对局统计。"""
    session = PlaySession(pid=f"cal-{rank}-{seed}", size=size, rank=rank,
                          user_color="b", komi=default_komi(size),
                          autoreply=False, seed=seed)
    session.rng = random.Random(seed)
    first_pass_move = None
    n = 0
    while len(session.moves) < max_moves and session.status == "playing":
        n = len(session.moves)
        rep = None
        query = {
            "id": f"cal-{session.pid}-{n}",
            "moves": session.engine_moves(),
            "rules": "chinese",
            "komi": session.komi,
            "boardXSize": size,
            "boardYSize": size,
            "analyzeTurns": [n],
            "maxVisits": 1,
            "includePolicy": True,
            "overrideSettings": {"humanSLProfile": rank},
        }
        async for r in engine.analyze_stream(query, last_turn=n):
            rep = r
        from app.play import select_human_move
        used_human_policy = "humanPolicy" in rep
        vertex = select_human_move(rep, size, session.rng)
        session.apply(session.to_move, None if vertex.lower() == "pass" else vertex)
        if vertex.lower() == "pass" and first_pass_move is None:
            first_pass_move = n + 1
    # 终局判定:最后一手后的位置,用 ownership 估分(side-to-move 相对)
    n = len(session.moves)
    query = {"id": f"cal-{session.pid}-final", "moves": session.engine_moves(),
             "rules": "chinese", "komi": session.komi,
             "boardXSize": size, "boardYSize": size,
             "analyzeTurns": [n], "maxVisits": 64, "includeOwnership": True,
             "overrideSettings": {"humanSLProfile": rank}}
    rep = None
    async for r in engine.analyze_stream(query, last_turn=n):
        rep = r
    own = rep.get("ownership") or []
    total = sum(own)
    side = "b" if n % 2 == 0 else "w"
    black_score = total if side == "b" else -total
    winner = "black" if black_score > 0 else "white"
    return {
        "moves": len(session.moves),
        "winner": winner,
        "black_score_est": round(black_score, 1),
        "first_pass_move": first_pass_move,
        "used_human_policy": used_human_policy,
        "resigned": False,
    }


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=2, help="每档对局数")
    ap.add_argument("--size", type=int, default=9)
    ap.add_argument("--seed", type=int, default=2026, help="基础种子(每局种子 = seed + 局序)")
    ap.add_argument("--max-moves", type=int, default=250)
    ap.add_argument("--ranks", type=str, default=",".join(RANK_PROFILES))
    args = ap.parse_args()
    ranks = [r.strip() for r in args.ranks.split(",")]

    engine = KataGoEngine("/opt/homebrew/bin/katago",
                          str(ROOT / "backend/models/b18c384nbt-humanv0.bin.gz"),
                          str(ROOT / "backend/play.cfg"))
    await engine.start()
    await engine.wait_ready(600)

    out = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "size": args.size, "seed_base": args.seed, "max_moves": args.max_moves,
        "games_per_rank": args.games, "method": "humanPolicy sampling self-play",
        "ranks": {},
    }
    early_pass_move = args.size  # 少于此手数的 pass 记为异常
    for ri, rank in enumerate(ranks):
        stats = {"games": 0, "black_wins": 0, "white_wins": 0, "total_moves": 0,
                 "games_with_early_pass": 0, "pass_moves_total": 0,
                 "human_policy_moves": 0, "engine_errors": 0}
        for g in range(args.games):
            seed = args.seed + ri * 1000 + g
            try:
                r = await play_one(engine, args.size, rank, seed, args.max_moves, early_pass_move)
            except Exception as e:
                print(f"  [{rank} 局{g + 1}] 引擎错误:{e}")
                stats["engine_errors"] += 1
                continue
            stats["games"] += 1
            stats["total_moves"] += r["moves"]
            stats["black_wins" if r["winner"] == "black" else "white_wins"] += 1
            if r["first_pass_move"] is not None and r["first_pass_move"] <= early_pass_move:
                stats["games_with_early_pass"] += 1
            stats["human_policy_moves"] += 1 if r["used_human_policy"] else 0
            print(f"  [{rank} 局{g + 1}] {r['moves']} 手 胜={r['winner']} "
                  f"估分={r['black_score_est']} 首pass={r['first_pass_move']}")
        stats["avg_moves"] = round(stats["total_moves"] / stats["games"], 1) if stats["games"] else None
        stats["black_win_rate"] = round(stats["black_wins"] / stats["games"], 2) if stats["games"] else None
        stats["pass_anomaly_rate"] = round(stats["games_with_early_pass"] / stats["games"], 2) if stats["games"] else None
        out["ranks"][rank] = stats
        print(f"== {rank}: {stats['games']}局 黑胜率{stats['black_win_rate']} "
              f"平均{stats['avg_moves']}手 pass异常率{stats['pass_anomaly_rate']}")

    out_dir = ROOT / "backend" / "calibration"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"calibration_{time.strftime('%Y%m%d-%H%M%S')}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n已写入 {out_path}")
    await engine.stop()


if __name__ == "__main__":
    asyncio.run(main())
