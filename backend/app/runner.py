"""编排一次整谱复盘:组装查询 → 逐 turn 消费 → 写入 store 并广播。"""
from __future__ import annotations

import logging

from .analysis import build_summary, compute_turn
from .engine import KataGoEngine
from .store import GameStore

log = logging.getLogger("gotutor.runner")


async def run_game_analysis(engine: KataGoEngine, store: GameStore, gid: str) -> None:
    game = store.get(gid)
    info = game.info
    n = len(info.moves)
    query = {
        "id": gid,
        "moves": [[c, v if v else "pass"] for c, v in info.moves],
        "initialStones": [[c, v] for c, v in info.initial_stones],
        "rules": info.rules,
        "komi": info.komi,
        "boardXSize": info.board_size,
        "boardYSize": info.board_size,
        "analyzeTurns": list(range(n)),
        "maxVisits": game.visits,
        "includeOwnership": True,
    }
    if info.initial_player == "W":
        query["initialPlayer"] = "W"

    try:
        log.info("开始复盘 gid=%s 手数=%d visits=%d", gid, n, game.visits)
        async for rep in engine.analyze_stream(query, last_turn=n - 1):
            turn = rep.get("turnNumber")
            if turn is None or not (0 <= turn < n):
                continue
            mover, vertex = info.moves[turn]
            store.append_turn(gid, compute_turn(rep, mover, vertex))
        store.finish(gid, build_summary(store.get(gid).turns))
        log.info("复盘完成 gid=%s", gid)
    except Exception as e:  # noqa: BLE001 — 单局失败不应影响进程
        log.exception("复盘失败 gid=%s", gid)
        store.fail(gid, f"分析引擎错误:{e}")
