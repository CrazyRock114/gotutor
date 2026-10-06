"""对弈会话:与 human-SL 校准的 KataGo 对弈。

棋盘逻辑用 sgfmill.boards(row 0 = 底行);对 AI 着法与合法性最终以 KataGo 为准
(用户着法会随查询发给引擎,非法着会触发引擎错误 → 回滚并提示)。
"""
from __future__ import annotations

import random
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field

from sgfmill import boards

from .engine import KataGoEngine
from .rules import GTP_LETTERS, default_komi, gtp_to_sgf_rowcol, gtp_to_vertex, vertex_to_gtp  # P0-7

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
    """GTP 顶点 → [x, y](y=0 顶行);pass 返回 None;非法输入抛 ValueError。"""
    return gtp_to_vertex(gtp, size)


def xy_to_gtp(x: int, y: int) -> str:
    return vertex_to_gtp(y, x)


@dataclass
class PlaySession:
    pid: str
    size: int
    rank: str
    user_color: str          # sgfmill 小写 'b' | 'w'
    komi: float
    autoreply: bool = True   # False = 手动双色摆谱/测试模式(AI 不自动应手)
    seed: int | None = None  # humanPolicy 采样随机种子(固定可复现)
    board: object = field(default=None)
    moves: list = field(default_factory=list)   # [(colour, gtp顶点|None)]
    captures: dict = field(default_factory=lambda: {"b": 0, "w": 0})
    passes: int = 0
    status: str = "playing"  # playing | over
    result: str | None = None
    last_engine_move: str | None = None
    rng: object = field(default=None)
    human_policy_used: bool = False
    last_active: float = 0.0

    def __post_init__(self):
        self.board = boards.Board(self.size)
        # 围棋黑先:无论用户执何色,首手都是黑(P0-1 修复:白方开局由 AI 黑自动走第一手)
        self.to_move = "b"
        self.rng = random.Random(self.seed)
        # simple-ko 判定用:逐手局面指纹(含初始空盘)
        self._positions = [self._position_key(self.board)]

    # ---------- 规则辅助(P0-6) ----------
    def _position_key(self, bd) -> bytes:
        """局面指纹(全部占用点),用于 simple-ko 重复检测。"""
        pts = sorted(bd.list_occupied_points())
        return repr(pts).encode()

    @staticmethod
    def _group_has_liberty(bd, row: int, col: int) -> bool:
        """洪水填充:判断 (row,col) 所在棋串是否有气。"""
        colour = bd.get(row, col)
        seen: set[tuple[int, int]] = set()
        stack = [(row, col)]
        while stack:
            r, c = stack.pop()
            if (r, c) in seen:
                continue
            seen.add((r, c))
            for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if not (0 <= rr < bd.side and 0 <= cc < bd.side):
                    continue
                v = bd.get(rr, cc)
                if v is None:
                    return True
                if v == colour:
                    stack.append((rr, cc))
        return False

    # ---------- 着法 ----------
    def apply(self, colour: str, gtp: str | None) -> None:
        """在本地棋盘上落子(pass 传 None)。

        强制规则(P0-6):占用(ValueError)、自杀(ValueError)、simple-ko 立即回提(ValueError)。
        """
        if gtp is None or gtp.lower() == "pass":
            gtp = None
            self.moves.append((colour, None))
            self.passes += 1
        else:
            row, col = gtp_to_sgf_rowcol(gtp, self.size)
            assert row is not None, "非 pass 着法必须有坐标"
            test = self.board.copy()
            before_pts = set(self.board.list_occupied_points())
            ko_point = test.play(row, col, colour)  # 占用抛 ValueError;返回 simple-ko 点或 None
            if not ko_point and not self._group_has_liberty(test, row, col):
                raise ValueError("自杀:落子后无气且提不掉对方")
            new_key = self._position_key(test)
            if ko_point and len(self._positions) >= 2 and new_key == self._positions[-2]:
                raise ValueError("劫争:禁止立即回提(simple ko)")
            self.board = test
            after_pts = set(self.board.list_occupied_points())
            self.captures[colour] += len(before_pts - after_pts)
            self.moves.append((colour, gtp))
            self.passes = 0
            self._positions.append(self._position_key(self.board))
        # 轮次翻转(统一在此处理)
        self.to_move = "w" if colour == "b" else "b"

    def pop_move(self) -> tuple[str, str | None] | None:
        if not self.moves:
            return None
        move = self.moves.pop()
        self.rebuild()
        return move

    def rebuild(self) -> None:
        """按 moves 重放重建棋盘/提子/轮次/位置历史(悔棋用)。"""
        self.board = boards.Board(self.size)
        self.captures = {"b": 0, "w": 0}
        self.passes = 0
        self._positions = [self._position_key(self.board)]
        self.to_move = "b"
        for colour, gtp in self.moves:
            if gtp is None or gtp.lower() == "pass":
                self.passes += 1
                self._positions.append(self._position_key(self.board))
                self.to_move = "w" if colour == "b" else "b"
                continue
            row, col = gtp_to_sgf_rowcol(gtp, self.size)
            assert row is not None, "非 pass 着法必须有坐标"
            before_pts = set(self.board.list_occupied_points())
            self.board.play(row, col, colour)
            after_pts = set(self.board.list_occupied_points())
            self.captures[colour] += len(before_pts - after_pts)
            self._positions.append(self._position_key(self.board))
            self.to_move = "w" if colour == "b" else "b"

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
                xy = gtp_to_xy(gtp, self.size)
                sgf_v = f"{chr(ord('a') + xy[0])}{chr(ord('a') + xy[1])}"
            body.append(f";{colour.upper()}[{sgf_v}]")
        return head + "".join(body) + ")"


class PlayStore:
    """带 TTL 与容量上限的会话存储(P0-5):防长期运行无限增长。"""

    def __init__(self, max_sessions: int = 100, ttl_seconds: float = 2 * 3600):
        self._sessions: "OrderedDict[str, PlaySession]" = OrderedDict()
        self._max = max_sessions
        self._ttl = ttl_seconds

    def _prune(self) -> None:
        now = time.time()
        expired = [k for k, s in self._sessions.items() if now - s.last_active > self._ttl]
        for k in expired:
            del self._sessions[k]
        while len(self._sessions) > self._max:
            self._sessions.popitem(last=False)

    def create(self, size: int, rank: str, user_color: str, komi: float,
               autoreply: bool = True, seed: int | None = None) -> PlaySession:
        self._prune()
        pid = uuid.uuid4().hex[:12]
        s = PlaySession(pid=pid, size=size, rank=rank, user_color=user_color, komi=komi,
                        autoreply=autoreply, seed=seed)
        s.last_active = time.time()
        self._sessions[pid] = s
        return s

    def get(self, pid: str) -> PlaySession | None:
        s = self._sessions.get(pid)
        if s is None:
            return None
        if time.time() - s.last_active > self._ttl:
            del self._sessions[pid]
            return None
        s.last_active = time.time()
        self._sessions.move_to_end(pid)
        return s


def select_human_move(rep: dict, size: int, rng) -> str:
    """按 KataGo Human-SL 官方指导:从 humanPolicy 概率分布采样(P0-2)。

    policy 数组:长度 size*size+1,行主序自左上角,末位为 pass,非法点为 -1。
    """
    policy = rep.get("humanPolicy") or rep.get("policy")
    if not policy:
        raise ValueError("引擎响应缺少 humanPolicy/policy")
    entries = [(i, p) for i, p in enumerate(policy) if isinstance(p, (int, float)) and p > 0]
    if not entries:
        raise ValueError("policy 无合法候选点")
    idx = rng.choices([i for i, _ in entries], weights=[p for _, p in entries])[0]
    if idx == size * size:
        return "pass"
    x, y = idx % size, idx // size
    return f"{GTP_LETTERS[x]}{size - y}"


async def ai_move(engine: KataGoEngine, session: PlaySession, visits: int = 1) -> str:
    """为当前行棋方生成一手人类棋风着法(humanPolicy 概率采样,返回实际落子顶点)。"""
    n = len(session.moves)
    query = {
        "id": f"play-{session.pid}-{n}",
        "moves": session.engine_moves(),
        "rules": "chinese",
        "komi": session.komi,
        "boardXSize": session.size,
        "boardYSize": session.size,
        "analyzeTurns": [n],
        "maxVisits": visits,
        "includePolicy": True,  # P0-2:必须取 humanPolicy
        "overrideSettings": {"humanSLProfile": session.rank},
    }
    last_turn_report = None
    async for rep in engine.analyze_stream(query, last_turn=n):
        last_turn_report = rep
    if not last_turn_report:
        raise RuntimeError("引擎未返回结果")
    session.human_policy_used = "humanPolicy" in last_turn_report

    ai_colour = session.to_move
    try:
        vertex = select_human_move(last_turn_report, session.size, session.rng)
    except ValueError:
        vertex = None  # 无 policy 时回退 moveInfos top-1
    if vertex is not None:
        try:
            session.apply(ai_colour, None if vertex.lower() == "pass" else vertex)
            return vertex
        except ValueError:
            pass  # 极小概率采样到非法着 → 回退 top moveInfos
    infos = sorted(last_turn_report.get("moveInfos") or [], key=lambda m: m.get("order", 1 << 30))
    for m in infos:
        try:
            session.apply(ai_colour, None if m["move"].lower() == "pass" else m["move"])
            return m["move"]
        except ValueError:
            continue
    raise RuntimeError("AI 着法全部非法")


# 兼容旧名
engine_reply = ai_move
