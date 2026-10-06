#!/usr/bin/env python3
"""对弈模式端到端冒烟:建局 → 数手对弈 → 停一手 → 悔棋 → 检查状态。"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8000"


def post(path, payload=None):
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"__error": e.code, "detail": e.read().decode()[:200]}


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=60) as r:
        return json.load(r)


def main():
    color = sys.argv[1] if len(sys.argv) > 1 else "black"
    t0 = time.time()
    s = post("/api/play", {"size": 9, "rank": "rank_15k", "color": color})
    if "__error" in s:
        print("FAIL create:", s)
        sys.exit(1)
    pid = s["playId"]
    print(f"对局创建 pid={pid} color={color} moves={len(s['moves'])} toMove={s['toMove']}")
    if color == "white":
        assert len(s["moves"]) == 1 and s["moves"][0]["color"] == "B", "P0-1: AI 黑首手缺失"
        assert s["toMove"] == "W"
    print(f"引擎首手加载耗时 {time.time()-t0:.1f}s,AI 首手={s['moves'][0]['move'] if s['moves'] else None}")

    # 黑连下 6 手(简单角部/边上序列)
    seq = ["C7", "E5", "G7", "G5", "C4", "F5"]
    for i, v in enumerate(seq):
        r = post(f"/api/play/{pid}/move", {"vertex": v})
        if "__error" in r:
            print(f"FAIL move {i+1} {v}:", r)
            sys.exit(1)
        print(f"  黑{v} → 白应 {r.get('reply')} | 手数 {len(r['moves'])} 提子 {r['captures']}")
        if r["status"] != "playing":
            print("对局提前结束:", r.get("result"))
            break

    # 停一手(白应后若又停 → 结束;正常白会下子)
    r = post(f"/api/play/{pid}/move", {"vertex": "pass"})
    print("黑 pass → 白:", r.get("reply"), "| passes:", 1)
    r2 = get(f"/api/play/{pid}")
    print("状态:", r2["status"], "手数:", len(r2["moves"]))

    # 悔棋:应回到轮黑
    r = post(f"/api/play/{pid}/undo")
    print("悔棋后 手数:", len(r["moves"]), "轮到:", r["toMove"])

    # 非法着:下在已占用点
    r = post(f"/api/play/{pid}/move", {"vertex": r2["moves"][0]["move"]})
    print("故意下已占点:", r.get("__error"), r.get("detail", "")[:60])

    # 认输
    r = post(f"/api/play/{pid}/resign")
    print("认输 → status:", r["status"], "result:", r["result"])
    print("\nOK")


if __name__ == "__main__":
    main()
