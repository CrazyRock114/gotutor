"""失点计算与分类测试(纯函数)。"""
from app.analysis import build_summary, classify, compute_turn


def test_classify_thresholds():
    assert classify(None, False) == "ok"
    assert classify(0.0, True) == "best"
    assert classify(0.2, False) == "ok"
    assert classify(0.8, False) == "slip"
    assert classify(2.0, False) == "mistake"
    assert classify(7.5, False) == "blunder"


def _fake_rep(winrate, turn=3):
    return {
        "turn": turn,
        "rootInfo": {"winrate": winrate, "scoreLead": 1.2, "visits": 120},
        "moveInfos": [
            {"move": "Q16", "winrate": winrate, "scoreLead": 1.2, "visits": 90, "order": 0, "pv": ["Q16", "D4"]},
            {"move": "D4", "winrate": winrate - 0.03, "scoreLead": 0.4, "visits": 20, "order": 1, "pv": ["D4"]},
        ],
        "ownership": [1.0] * 361,
    }


def test_compute_turn_black():
    data = compute_turn(_fake_rep(0.55), mover="B", chosen="D4")
    assert data["player"] == "B"
    assert data["winrateBlack"] == 55.0
    assert data["scoreLeadBlack"] == 1.2
    assert data["loss"] == 3.0
    assert data["cls"] == "mistake"
    assert len(data["ownership"]) == 361
    assert data["topMoves"][0]["winrate"] == 55.0  # 行棋方(黑)视角


def test_compute_turn_white_perspective_flips():
    data = compute_turn(_fake_rep(0.55), mover="W", chosen="D4")
    # 白行棋:rootInfo 0.55 是白的胜率 → 黑视角 45%
    assert data["winrateBlack"] == 45.0
    assert data["scoreLeadBlack"] == -1.2
    assert data["topMoves"][0]["winrate"] == 55.0  # 仍为行棋方(白)视角


def test_compute_turn_chosen_missing():
    data = compute_turn(_fake_rep(0.5), mover="B", chosen="ZZZ")
    assert data["loss"] is None
    assert data["cls"] == "ok"


def test_compute_turn_ownership_normalized_to_black():
    # 行棋方视角的 ownership 应归一化为黑视角:白行棋时全体取反
    rep = _fake_rep(0.5)
    rep["ownership"] = [0.5, -0.25]
    black = compute_turn(rep, mover="B", chosen="D4")
    white = compute_turn(rep, mover="W", chosen="D4")
    assert black["ownership"] == [0.5, -0.25]
    assert white["ownership"] == [-0.5, 0.25]


def test_build_summary():
    turns = [
        {"turn": 0, "player": "B", "move": "Q16", "loss": 0.1, "cls": "best"},
        {"turn": 1, "player": "W", "move": "D4", "loss": 6.2, "cls": "blunder"},
        {"turn": 2, "player": "B", "move": "R4", "loss": 2.0, "cls": "mistake"},
        {"turn": 3, "player": "W", "move": "C3", "loss": 0.3, "cls": "ok", "winrateBlack": 48.2, "scoreLeadBlack": -0.5},
    ]
    s = build_summary(turns)
    assert s["counts"]["best"] == 1
    assert s["counts"]["blunder"] == 1
    assert s["topMistakes"][0]["turn"] == 1
    assert s["winrateBlackFinal"] == 48.2
