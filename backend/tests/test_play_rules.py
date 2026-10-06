"""规则回归测试(P0-6):直接命中 production 实现 PlaySession。

覆盖:simple-ko 立即回提、自杀、提子、双停终局、黑先/白方开局、跨停着/提子悔棋。
"""
import pytest

from app.play import PlaySession


def make(size=9, color="b", rank="rank_15k", autoreply=False, seed=None):
    s = PlaySession(pid="t", size=size, rank=rank, user_color=color, komi=5.5,
                    autoreply=autoreply, seed=seed)
    return s


# ---------- 基础落子 / 提子 ----------

def test_capture_single_stone():
    s = make()
    for c, v in [("b", "D5"), ("w", "E5"), ("b", "E6"), ("w", "pass"), ("b", "F5"), ("w", "pass")]:
        s.apply(c, v)
    s.apply("b", "E4")  # 提白 E5
    assert s.captures["b"] == 1
    assert s.board.get(4, 4) is None  # E5 sgfmill 坐标 (4,4)


def test_suicide_rejected():
    s = make()
    for v in ["D5", "E6", "F5", "E4"]:
        s.apply("b", v)
    with pytest.raises(ValueError, match="自杀"):
        s.apply("w", "E5")


def test_simple_ko_immediate_recapture_rejected():
    s = make()
    for c, v in [("b", "H2"), ("w", "E6"), ("b", "E7"), ("w", "D5"),
                 ("b", "F6"), ("w", "D7"), ("b", "E5"), ("w", "C6")]:
        s.apply(c, v)
    s.apply("b", "D6")  # 提劫(提掉白一子)
    assert s.captures["b"] >= 1
    with pytest.raises(ValueError, match="劫争"):
        s.apply("w", "E6")  # 立即回提 → simple ko 拒绝
    s.apply("w", "B8")  # 劫消解后可正常落子


# ---------- 轮次 / 开局(P0-1) ----------

def test_black_moves_first_even_for_white_player():
    s = make(color="w", autoreply=True)
    assert s.to_move == "b"  # 黑永远先走


def test_turn_flips_after_each_move():
    s = make(autoreply=False)
    assert s.to_move == "b"
    s.apply("b", "E5")
    assert s.to_move == "w"
    s.apply("w", "D5")
    assert s.to_move == "b"


# ---------- 停着 / 悔棋 ----------

def test_pass_pass_and_undo_across_pass():
    s = make(autoreply=False)
    s.apply("b", "pass")
    s.apply("w", "pass")
    assert s.passes == 2
    move = s.pop_move()
    assert move == ("w", None)
    assert s.passes == 1
    assert s.to_move == "w"


def test_undo_across_capture_restores_stone():
    s = make(autoreply=False)
    for c, v in [("b", "D5"), ("w", "E5"), ("b", "E6"), ("w", "pass"), ("b", "F5"), ("w", "pass")]:
        s.apply(c, v)
    s.apply("b", "E4")
    assert s.captures["b"] == 1
    s.pop_move()  # 撤销提子手
    assert s.captures["b"] == 0
    assert s.board.get(4, 4) == "w"  # 白子还原


# ---------- 贴目 / profile ----------

def test_komi_from_policy():
    from app.rules import default_komi
    assert default_komi(9) == 5.5
    assert default_komi(13) == 6.5
    assert default_komi(19) == 7.5


def test_seed_makes_sampling_reproducible():
    s1 = make(seed=42)
    s2 = make(seed=42)
    import random
    r1 = random.Random(42).random()
    assert s1.rng.random() == r1
    assert s2.rng.random() == r1
