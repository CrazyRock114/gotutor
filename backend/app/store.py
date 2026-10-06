"""内存态对局存储 + SSE 订阅广播(LRU + 容量上限,防长期运行无限增长)。"""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from dataclasses import dataclass, field


@dataclass
class Game:
    gid: str
    meta: dict
    info: object            # sgf.GameInfo
    visits: int
    touched: float = 0.0    # LRU 触点(P0-5)
    status: str = "running"     # running | done | error
    turns: list = field(default_factory=list)
    error: str | None = None
    summary: dict | None = None
    subscribers: set = field(default_factory=set)   # asyncio.Queue


class GameStore:
    def __init__(self, max_games: int = 200):
        self._games: "OrderedDict[str, Game]" = OrderedDict()
        self._max = max_games

    def create(self, gid: str, meta: dict, info, visits: int) -> Game:
        import time
        while len(self._games) >= self._max:  # LRU 淘汰最旧对局(P0-5)
            self._games.popitem(last=False)
        game = Game(touched=time.time(), gid=gid, meta=meta, info=info, visits=visits)
        self._games[gid] = game
        return game

    def get(self, gid: str) -> Game | None:
        game = self._games.get(gid)
        if game is None:
            return None
        import time
        game.touched = time.time()
        self._games.move_to_end(gid)
        return game

    def append_turn(self, gid: str, turn_data: dict) -> None:
        game = self._games[gid]
        game.turns.append(turn_data)
        for q in list(game.subscribers):
            q.put_nowait(("turn", turn_data))

    def finish(self, gid: str, summary: dict) -> None:
        game = self._games[gid]
        game.status = "done"
        game.summary = summary
        for q in list(game.subscribers):
            q.put_nowait(("done", summary))

    def fail(self, gid: str, message: str) -> None:
        game = self._games[gid]
        game.status = "error"
        game.error = message
        for q in list(game.subscribers):
            q.put_nowait(("error", {"message": message}))

    def subscribe(self, gid: str) -> asyncio.Queue:
        game = self._games[gid]
        q: asyncio.Queue = asyncio.Queue()
        game.subscribers.add(q)
        return q

    def unsubscribe(self, gid: str, q: asyncio.Queue) -> None:
        game = self._games.get(gid)
        if game:
            game.subscribers.discard(q)
