"""集中管理围棋规则常量与策略(P0-7):坐标转换、贴目、规则串。

禁止在业务代码中散落 komi=7.5 / 坐标转换等——一律 import 本模块。
"""
from __future__ import annotations

GTP_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ"  # GTP 列字母(无 I)

# 贴目策略(中国规则):按路数集中定义,修改只动这一处
DEFAULT_KOMI: dict[int, float] = {9: 5.5, 13: 6.5, 19: 7.5}
DEFAULT_RULES = "chinese"


def default_komi(size: int) -> float:
    """按棋盘路数返回默认贴目。"""
    return DEFAULT_KOMI.get(size, 7.5)


def vertex_to_gtp(row: int, col: int) -> str:
    """sgfmill 坐标(row 0 = 底行)→ GTP 顶点(如 Q16)。"""
    return f"{GTP_LETTERS[col]}{row + 1}"


def gtp_to_vertex(gtp: str, size: int) -> tuple[int, int] | None:
    """GTP 顶点 → [x, y](y=0 顶行);pass 返回 None;非法输入抛 ValueError。"""
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
    y = size - num
    return y, col


def gtp_to_sgf_rowcol(gtp: str, size: int) -> tuple[int, int] | None:
    """GTP 顶点 → sgfmill (row, col)(row 0 = 底行);pass 返回 None。"""
    xy = gtp_to_vertex(gtp, size)
    if xy is None:
        return None
    y, x = xy
    return size - 1 - y, x
