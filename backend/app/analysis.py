"""失点计算与失误分类(纯函数,便于测试)。

视角约定:
- KataGo analysis 引擎的 winrate/scoreLead 均为"行棋方"视角。
- 对外输出统一换算为:winrateBlack/scoreLeadBlack(黑白视角,供曲线图),
  topMoves[*].winrate/scoreLead 保持"行棋方"视角(供候选点展示)。
"""
from __future__ import annotations

# 失误分级:失点(胜率百分点)
CLASS_LABELS = {
    "best": "最佳",
    "ok": "正着",
    "slip": "小损",
    "mistake": "错着",
    "blunder": "大失误",
}

CLASS_COLORS = {
    "best": "#059669",
    "ok": "#84cc16",
    "slip": "#eab308",
    "mistake": "#f97316",
    "blunder": "#ef4444",
}


def classify(loss: float | None, is_top: bool) -> str:
    if loss is None:
        return "ok"
    if is_top and loss < 0.3:
        return "best"
    if loss >= 5.0:
        return "blunder"
    if loss >= 1.5:
        return "mistake"
    if loss >= 0.5:
        return "slip"
    return "ok"


def compute_turn(rep: dict, mover: str, chosen: str | None) -> dict:
    """把 KataGo 单 turn 结果折算为前端友好的结构。

    rep: analysis 引擎对 turn t 的报告(局面 = 已下 t 手,行棋方 = moves[t] 的执子者)
    """
    ri = rep.get("rootInfo") or {}
    best_wr = ri.get("winrate", 0.5)
    best_sl = ri.get("scoreLead", 0.0)
    sign = 1 if mover == "B" else -1

    infos = sorted(rep.get("moveInfos") or [], key=lambda m: m.get("order", 1 << 30))
    chosen_info = next((m for m in infos if m.get("move") == chosen), None)

    loss = None
    if chosen_info is not None:
        loss = max(0.0, (best_wr - chosen_info["winrate"]) * 100.0)

    top_moves = [
        {
            "move": m.get("move"),
            "visits": m.get("visits", 0),
            # 行棋方视角(与 KataGo 原始输出一致),前端标注执子方颜色
            "winrate": round(m.get("winrate", 0.0) * 100.0, 1),
            "scoreLead": round(m.get("scoreLead", 0.0), 1),
            "pv": m.get("pv", [])[:12],
        }
        for m in infos[:3]
    ]

    data = {
        "turn": rep.get("turnNumber"),
        "player": mover,
        "move": chosen,
        "winrateBlack": round((best_wr if mover == "B" else 1.0 - best_wr) * 100.0, 1),
        "scoreLeadBlack": round(best_sl * sign, 1),
        "loss": round(loss, 1) if loss is not None else None,
        "cls": classify(loss, bool(chosen_info and chosen_info.get("order") == 0)),
        "topMoves": top_moves,
        "visits": ri.get("visits", 0),
    }

    ownership = rep.get("ownership")
    if ownership is not None:
        # KataGo(SIDETOMOVE 配置下)ownership 为行棋方视角,统一归一化为黑视角(正=黑)
        flip = 1.0 if mover == "B" else -1.0
        data["ownership"] = [round(v * flip, 2) for v in ownership]

    return data


def build_summary(turns: list) -> dict:
    counts = {k: 0 for k in CLASS_LABELS}
    for t in turns:
        counts[t.get("cls", "ok")] = counts.get(t.get("cls", "ok"), 0) + 1

    mistakes = [
        {"turn": t["turn"], "player": t["player"], "move": t["move"], "loss": t["loss"], "cls": t["cls"]}
        for t in turns
        if t.get("cls") in ("mistake", "blunder") and t.get("loss") is not None
    ]
    mistakes.sort(key=lambda m: m["loss"], reverse=True)

    final = turns[-1] if turns else None
    return {
        "counts": counts,
        "topMistakes": mistakes[:8],
        "winrateBlackFinal": final["winrateBlack"] if final else None,
        "scoreLeadBlackFinal": final["scoreLeadBlack"] if final else None,
    }
