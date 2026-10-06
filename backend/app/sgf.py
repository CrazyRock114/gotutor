"""SGF 解析:提取对局元信息与着法序列(GTP 顶点格式)。"""
from __future__ import annotations

from dataclasses import dataclass, field

from sgfmill import sgf

# GTP 列字母(跳过 I)
GTP_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ"


def vertex_to_gtp(row: int, col: int) -> str:
    """sgfmill 坐标(row 0 = 底行)→ GTP 顶点(如 Q16)。"""
    return f"{GTP_LETTERS[col]}{row + 1}"


@dataclass
class GameInfo:
    board_size: int
    moves: list = field(default_factory=list)        # [( "B"|"W", gtp顶点或None(停着) )]
    komi: float = 7.5
    rules: str = "chinese"
    handicap: int = 0
    initial_stones: list = field(default_factory=list)  # [("B","Q16"), ...]
    initial_player: str = "B"
    meta: dict = field(default_factory=dict)


def _load_sgf(data: bytes):
    """加载 SGF。SGF 规范默认编码是 ISO-8859-1,但中文棋谱普遍是无 CA[] 的 UTF-8,需探测。"""
    if b"CA[" in data:
        try:
            return sgf.Sgf_game.from_bytes(data)
        except ValueError as e:
            raise ValueError(f"SGF 解析失败:{e}") from e
    try:
        data.decode("utf-8")
        utf8_ok = True
    except UnicodeDecodeError:
        utf8_ok = False
    try:
        if utf8_ok:
            return sgf.Sgf_game.from_bytes(data, override_encoding="utf-8")
        return sgf.Sgf_game.from_bytes(data)
    except (ValueError, UnicodeDecodeError) as e:
        raise ValueError(f"SGF 解析失败:{e}") from e


def _map_rules(ru: str | None) -> str:
    """SGF RU 属性 → KataGo 规则串。"""
    r = (ru or "").strip().lower()
    if "japan" in r or "korea" in r:
        return "japanese"
    if "aga" in r:
        return "aga"
    if "chinese" in r or r == "cn":
        return "chinese"
    return "chinese"


def parse_sgf(data: bytes) -> GameInfo:
    game = _load_sgf(data)
    size = game.get_size()
    if not (2 <= size <= 25):
        raise ValueError(f"不支持的棋盘大小:{size}")

    root = game.get_root()

    def prop(name, default=None):
        try:
            return root.get(name)
        except KeyError:
            return default

    km = prop("KM")
    try:
        komi = float(km) if km is not None else 7.5
    except (TypeError, ValueError):
        komi = 7.5

    handicap = prop("HA")
    try:
        handicap = int(handicap) if handicap is not None else 0
    except (TypeError, ValueError):
        handicap = 0

    initial_stones = []
    for colour, prop_name in (("B", "AB"), ("W", "AW")):
        for r, c in prop(prop_name) or []:
            initial_stones.append((colour, vertex_to_gtp(r, c)))

    moves = []
    for i, node in enumerate(game.get_main_sequence()[1:]):
        try:
            colour, point = node.get_move()
        except ValueError:
            raise ValueError(f"第 {i + 1} 手的着法坐标无法解析(请检查棋谱格式)") from None
        if colour is None:
            continue  # 纯注释/摆子节点
        if point is None:
            moves.append((colour.upper(), None))  # 停着
        else:
            moves.append((colour.upper(), vertex_to_gtp(*point)))

    if not moves and not initial_stones:
        raise ValueError("棋谱中没有着法")

    meta_raw = {k: prop(k) for k in ("PB", "PW", "BR", "WR", "BT", "WT", "DT", "PC", "EV", "RE", "ON", "GC", "C", "GN")}
    meta = {k: v for k, v in meta_raw.items() if v}

    return GameInfo(
        board_size=size,
        moves=moves,
        komi=komi,
        rules=_map_rules(prop("RU")),
        handicap=handicap,
        initial_stones=initial_stones,
        initial_player="W" if handicap >= 2 else "B",
        meta=meta,
    )
