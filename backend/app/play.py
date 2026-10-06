"""对弈会话:与 human-SL 校准的 KataGo 对弈。

棋盘逻辑用 sgfmill.boards(row 0 = 底行);对 AI 着法与合法性最终以 KataGo 为准
(用户着法会随查询发给引擎,非法着会触发引擎错误 → 回滚并提示)。
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sgfmill import boards

from .engine import KataGoEngine

GTP_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ"

# human-SL 支持的段位档位(已文档化区间 rank_20k ~ rank_9d)
RANK_PROFILES = ["rank_20k", "rank_15k", "rank_10k", "rank_5k", "rank_1k", "rank_1d"]
RANK_LABELS = {
    "rank_20k": "20级",
    "rank_15k": "15级",
    "rank_10k": "10级",
    "rank_5k": "5级",
    "rank_1k": "1级",
    "rank_1d": "初段",
}


def gtp_to_xy(gtp: str, size: int) -> tuple[int, int] | None:
    """GTP 顶点 → sgfmill (row, col);pass 返回 None;非法输入抛 ValueError。"""
    if gtp.lower() == "pass":
        return None
    if len(gtp) < 2:
        raise ValueError(f"非法顶点:{gtp}")
    col = GTP_LETTERS.find(gtp[0].upper())
    if col < 0 or col >= size:
        raise ValueError(f"非法顶点:{gtp}")
    try:
        num = int(gtp[1:])
    except ValueError:
        raise ValueError(f"非法顶点:{gtp}") from None
    if not (1 <= num <= size):
        raise ValueError(f"非法顶点:{gtp}")
    return size - num, col


def xy_to_gtp(row: int, col: int) -> str:
    return f"{GTP_LETTERS[col]}{row + 1}"


@dataclass
class PlaySession:
    pid: str
    size: int
    rank: str
    user_color: str          # sgfmill 小写 'b' | 'w'
    komi: float
    board: object = field(default=None)
    moves: list = field(default_factory=list)   # [(colour, gtp顶点|None)]
    captures: dict = field(default_factory=lambda: {"b": 0, "w": 0})
    passes: int = 0
    status: str = "playing"  # playing | over
    result: str | None = None
    last_engine_move: str | None = None

    def __post_init__(self):
        self.board = boards.Board(self.size)
        # 围棋黑先:无论用户执何色,首手都是黑(P0-1 修复:白方开局由 AI 黑自动走第一手)
        self.to_move = "b"

    # ---------- 着法 ----------
    def apply(self, colour: str, gtp: str | None) -> None:
        """在本地棋盘上落子(pass 传 None)。非法着会抛 ValueError。"""
        if gtp is None:
            self.moves.append((colour, None))
            self.passes += 1
            return
        xy = gtp_to_xy(gtp, self.size)
        assert xy is not None
        row, col = xy
        captured = self.board.play(row, col, colour) or []  # 非法(占用)抛 ValueError
        self.captures[colour] += len(captured)
        self.moves.append((colour, gtp))
        self.passes = 0

    def pop_move(self) -> tuple[str, str | None] | None:
        if not self.moves:
            return None
        move = self.moves.pop()
        self.rebuild()
        return move

    def rebuild(self) -> None:
        """按 moves 重放重建棋盘与提子数(悔棋用,手数少代价可忽略)。"""
        self.board = boards.Board(self.size)
        self.captures = {"b": 0, "w": 0}
        for colour, gtp in self.moves:
            if gtp is None:
                continue
            row, col = gtp_to_xy(gtp, self.size)
            captured = self.board.play(row, col, colour) or []
            self.captures[colour] += len(captured)

    # ---------- 状态 ----------
    def sign_map(self) -> list[list[int]]:
        """前端 shudan 格式:signMap[y][x],y=0 为顶行,1 黑 -1 白。"""
        rows = []
        for y in range(self.size):
            row = []
            for x in range(self.size):
                v = self.board.get(self.size - 1 - y, x)
                row.append(1 if v == "b" else -1 if v == "w" else 0)
            rows.append(row)
        return rows

    def engine_moves(self) -> list[list[str]]:
        """引擎查询用 moves:[["B","Q16"]...]。"""
        return [[c.upper(), g if g else "pass"] for c, g in self.moves]

    def state(self) -> dict:
        return {
            "playId": self.pid,
            "boardSize": self.size,
            "rank": self.rank,
            "rankLabel": RANK_LABELS.get(self.rank, self.rank),
            "userColor": self.user_color,
            "komi": self.komi,
            "board": self.sign_map(),
            "moves": [
                {"player": "user" if c == self.user_color else "ai", "color": c.upper(), "move": g}
                for c, g in self.moves
            ],
            "captures": self.captures,
            "toMove": self.to_move.upper(),
            "status": self.status,
            "result": self.result,
            "lastEngineMove": self.last_engine_move,
        }

    def sgf(self) -> str:
        sz = self.size
        ai_name = f"KataGo human-SL {RANK_LABELS.get(self.rank, self.rank)}"
        black = "玩家" if self.user_color == "b" else ai_name
        white = ai_name if self.user_color == "b" else "玩家"
        head = (
            f"(;GM[1]FF[4]CA[UTF-8]SZ[{sz}]KM[{self.komi}]RU[Chinese]"
            f"PB[{black}]PW[{white}]C[Gotutor 对弈]"
        )
        body = []
        for colour, gtp in self.moves:
            sgf_v = ""
            if gtp:
                row, col = gtp_to_xy(gtp, self.size)
                sgf_v = f"{chr(ord('a') + col)}{chr(ord('a') + (self.size - 1 - row))}"
            body.append(f";{colour.upper()}[{sgf_v}]")
        return head + "".join(body) + ")"


class PlayStore:
    def __init__(self):
        self._sessions: dict[str, PlaySession] = {}

    def create(self, size: int, rank: str, user_color: str, komi: float) -> PlaySession:
        pid = uuid.uuid4().hex[:12]
        s = PlaySession(pid=pid, size=size, rank=rank, user_color=user_color, komi=komi)
        self._sessions[pid] = s
        return s

    def get(self, pid: str) -> PlaySession | None:
        return self._sessions.get(pid)


async def engine_reply(
    engine: KataGoEngine, session: PlaySession, visits: int = 2
) -> str:
    """让引擎为当前局面生成一手(用 analysis 引擎 + humanSL 档位,top move)。"""
    n = len(session.moves)
    query = {
        "id": f"play-{session.pid}-{n}",
        "moves": session.engine_moves(),
        "rules": "chinese",
        "komi": session.komi,
        "boardXSize": session.size,
        "boardYSize": session.size,
        "analyzeTurns": [n],  # 只分析最终局面(下一手)
        "maxVisits": visits,
        "overrideSettings": {"humanSLProfile": session.rank},
    }
    if session.user_color == "w":
        query["initialPlayer"] = "B"  # 引擎视角:黑先行(若用户执白,引擎执黑)
    else:
        query["initialPlayer"] = "B"

    last_turn_report = None
    async for rep in engine.analyze_stream(query, last_turn=n):
        last_turn_report = rep
    if not last_turn_report or not last_turn_report.get("moveInfos"):
        raise RuntimeError("引擎未返回着法")
    infos = sorted(last_turn_report["moveInfos"], key=lambda m: m.get("order", 1 << 30))
    return infos[0]["move"]
