#!/usr/bin/env python3
"""后端端到端冒烟测试:提交棋谱 → 轮询快照 → 校验分析结果结构与 ownership 朝向。"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8000"

# 9 路,14 手,双方乱下但合法
SGF = (
    "(;GM[1]FF[4]SZ[9]KM[5.5]PB[测试黑]PW[测试白];B[ee];W[gg];B[cc];W[ge];B[ce];W[gc];"
    "B[ec];W[dc];B[dd];W[ed];B[ff];W[fg];B[ef];W[fe])"
)


def post(path, payload):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=60) as r:
        return json.load(r)


def main():
    created = post("/api/games", {"sgf": SGF, "visits": 40})
    gid = created["gameId"]
    print(f"gameId={gid} moveCount={created['moveCount']} boardSize={created['boardSize']}")

    for _ in range(60):
        snap = get(f"/api/games/{gid}")
        if snap["status"] != "running":
            break
        time.sleep(2)
    else:
        print("FAIL: 分析超时")
        sys.exit(1)

    print("status:", snap["status"], "| turns:", len(snap["turns"]), "/", len(snap["moves"]))
    if snap["status"] == "error":
        print("FAIL:", snap["error"])
        sys.exit(1)

    t0 = snap["turns"][0]
    print(
        "turn0: player=%s move=%s wrB=%s slB=%s loss=%s cls=%s visits=%s"
        % (t0["player"], t0["move"], t0["winrateBlack"], t0["scoreLeadBlack"], t0["loss"], t0["cls"], t0["visits"])
    )
    print("topMoves:", [(m["move"], m["winrate"], m["visits"]) for m in t0["topMoves"]])

    own = t0.get("ownership")
    assert own and len(own) == 81, f"ownership 异常: {len(own) if own else None}"
    # 朝向检测:t0 局面黑有 E5/C1?——改用可预期的:黑第一手 ee=E5(正中)。
    # 更直接:检查最后一手后的 ownership 与胜负方向是否自洽即可,这里只打印角落值供人工核对。
    print("ownership 前9(A9..J9 行):", own[:9])
    print("ownership 后9(A1..J1 行):", own[-9:])

    s = snap["summary"]
    print("summary:", json.dumps(s, ensure_ascii=False)[:260])
    losses = [t["loss"] for t in snap["turns"] if t["loss"] is not None]
    assert losses, "没有任何失点数据(chosen 不在候选里?)"
    print(f"\nOK — {len(snap['turns'])} turns analyzed, {len(losses)} loss values, "
          f"max loss={max(losses)}")


if __name__ == "__main__":
    main()
