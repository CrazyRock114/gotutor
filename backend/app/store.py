"""内存态对局存储 + SSE 订阅广播。"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field


@dataclass
class Game:
    gid: str
    meta: dict
    info: object            # sgf.GameInfo
    visits: int
    status: str = "running"     # running | done | error
    turns: list = field(default_factory=list)
    error: str | None = None
    summary: dict | None = None
    subscribers: set = field(default_factory=set)   # asyncio.Queue


class GameStore:
    def __init__(self):
        self._games: dict[str, Game] = {}

    def create(self, gid: str, meta: dict, info, visits: int) -> Game:
        game = Game(gid=gid, meta=meta, info=info, visits=visits)
        self._games[gid] = game
        return game

    def get(self, gid: str) -> Game | None:
        return self._games.get(gid)

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
