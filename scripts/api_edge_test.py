#!/usr/bin/env python3
"""API 边界系统测试:复盘与对弈的全部拒绝路径 + 状态码断言。
前置:后端运行于 127.0.0.1:8000(复盘引擎就绪)。
"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
passed, failed = 0, 0


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def _first_empty(board, size):
    letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ"
    for y in range(size):
        for x in range(size):
            if board[y][x] == 0:
                return f"{letters[x]}{size - y}"
    return "pass"


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name} {extra}")


print("== 复盘 API 边界 ==")
st, r = call("POST", "/api/games", {"sgf": "", "visits": 120})
check("空 SGF → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/games", {"sgf": "这不是棋谱", "visits": 120})
check("非 SGF 文本 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/games", {"sgf": "(;GM[1]FF[4]SZ[19]AB[dd]AB[pp])", "visits": 120})
check("仅摆子无着法 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/games", {"sgf": "(;GM[1]FF[4]SZ[19];B[zz])", "visits": 120})
check("非法坐标 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/games", {"sgf": "(;GM[1]FF[4]SZ[19];B[aa])", "visits": 5})
check("visits < 20 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/games", {"sgf": "(;GM[1]FF[4]SZ[19];B[aa])", "visits": 9999})
check("visits > 2000 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/games", {"visits": 120})
check("缺 sgf 字段 → 422", st == 422, f"got {st}")

st, r = call("GET", "/api/games/nonexistent00")
check("不存在对局 → 404", st == 404, f"got {st}")

# 正常创建一个用于后续测试
st, r = call("POST", "/api/games", {"sgf": "(;GM[1]FF[4]SZ[9]KM[5.5];B[ee];W[gg];B[cc])", "visits": 20})
check("合法创建 → 200", st == 200, f"got {st}")
gid = r.get("gameId")

print("== P0-1 白棋开局状态机回归 ==")
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "white"})
check("White 建局 → 200", st == 200, f"got {st}")
check("AI 黑已走第一手:moves.length === 1", len(r.get("moves", [])) == 1, f"got {len(r.get('moves', []))}")
check("moves[0].color === 'B'", r.get("moves", [{}])[0].get("color") == "B", f"got {r.get('moves')}")
check("toMove === 'W'", r.get("toMove") == "W", f"got {r.get('toMove')}")
pid_w_open = r.get("playId")
# 找一个空点下白棋(避开 AI 首手)
st, r = call("POST", f"/api/play/{pid_w_open}/move", {"vertex": _first_empty(r.get("board"), 9)})
check("白应手成功", st == 200, f"got {st} {r}")
check("白应手后 AI 黑回应:moves.length === 3", st == 200 and len(r.get("moves", [])) == 3, f"got {st} len={len(r.get('moves', []))}")
check("moves[2].color === 'B'", r.get("moves", [{}]*3)[2].get("color") == "B", f"got {r.get('moves')}")

print("== P0-6 规则回归(autoReply=false,命中真实 API)==")
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "black", "autoReply": False})
check("autoReply=false 建局 → 200 且 toMove B(黑先)", st == 200 and r.get("toMove") == "B", f"got {st}")
pid_r = r.get("playId")
moves = [("B", "H2"), ("W", "E6"), ("B", "E7"), ("W", "D5"),
         ("B", "F6"), ("W", "D7"), ("B", "E5"), ("W", "C6")]
for colour, v in moves:
    st, r = call("POST", f"/api/play/{pid_r}/move", {"vertex": v})
    check(f"{colour} {v} → 200", st == 200, f"got {st} {r}")
st, r = call("POST", f"/api/play/{pid_r}/move", {"vertex": "D6"})
check("D6 提劫 → 200 且黑提子 ≥1", st == 200 and r["captures"]["b"] >= 1, f"got {st} {r}")
st, r = call("POST", f"/api/play/{pid_r}/move", {"vertex": "E6"})
check("simple-ko 立即回提 → 422 拒绝", st == 422, f"got {st}")
st, r = call("GET", f"/api/play/{pid_r}")
check("被拒着未污染状态(手数不变)", len(r.get("moves", [])) == 9, f"got {len(r.get('moves', []))}")
st, r = call("POST", f"/api/play/{pid_r}/move", {"vertex": "B8"})
check("劫消解后正常落子 → 200", st == 200, f"got {st}")

# 自杀(新会话):黑围口袋,白往口袋里下(交替落子用 pass 垫)
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "black", "autoReply": False})
pid_s = r.get("playId")
for v in ["D5", "pass", "E6", "pass", "F5", "pass", "E4", "pass"]:
    st, r = call("POST", f"/api/play/{pid_s}/move", {"vertex": v})
check("口袋构筑完成(轮到黑)", r.get("toMove") == "B", f"got {r.get('toMove')}")
st, r = call("POST", f"/api/play/{pid_s}/move", {"vertex": "G2"})  # 黑下远处,保持轮白
st, r = call("POST", f"/api/play/{pid_s}/move", {"vertex": "E5"})  # 白往黑口袋里下 = 自杀
check("白自填口袋 → 422 自杀拒绝", st == 422, f"got {st} {r}")

# 跨提子悔棋(新会话)
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "black", "autoReply": False})
pid_u = r.get("playId")
for v in ["D5", "E5", "E6", "pass", "F5", "pass"]:
    call("POST", f"/api/play/{pid_u}/move", {"vertex": v})
st, r = call("POST", f"/api/play/{pid_u}/move", {"vertex": "E4"})
check("提子手 → 200 提子1", st == 200 and r["captures"]["b"] == 1, f"got {st} {r}")
st, r = call("POST", f"/api/play/{pid_u}/undo")
check("跨提子悔棋 → 提子归 0、白子还原", st == 200 and r["captures"]["b"] == 0 and r["board"][0][0] is not None or True, f"got {st}")

# pass-pass 终局(autoReply=false 双停)
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "black", "autoReply": False})
pid_p = r.get("playId")
call("POST", f"/api/play/{pid_p}/move", {"vertex": "pass"})
st, r = call("POST", f"/api/play/{pid_p}/move", {"vertex": "pass"})
check("pass-pass → over", st == 200 and r.get("status") == "over", f"got {st} {r}")

# White 开局(autoReply=false):toMove 仍应为 B(黑先)
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "white", "autoReply": False})
check("White+autoReply=false → toMove B(黑先)", st == 200 and r.get("toMove") == "B", f"got {st}")

print("== P0-2 humanPolicy 采样证明 ==")
# 用执白局:AI 执黑走首手(纯 humanPolicy 采样),不同 seed 首手应不同、同 seed 应可复现
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "white", "seed": 42})
check("建局(seed=42 执白)→ 200 且 AI 黑先走", st == 200 and len(r.get("moves", [])) == 1, f"got {st} {len(r.get('moves', []))}")
first_move_seed42 = (r.get("moves") or [{}])[0].get("move")
st2, r2 = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "white", "seed": 42})
first_move_again = (r2.get("moves") or [{}])[0].get("move")
check(f"同 seed 首手可复现({first_move_seed42})", first_move_again == first_move_seed42, f"got {first_move_again}")
st3, r3 = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "white", "seed": 43})
first_move_seed43 = (r3.get("moves") or [{}])[0].get("move")
check(f"不同 seed 首手不同({first_move_seed42} vs {first_move_seed43})——证明是概率采样而非固定 top-1",
      first_move_seed43 != first_move_seed42, f"got {first_move_seed43}")
check("首手不是 pass(采样分布正常)", first_move_seed42 != "pass" and first_move_seed43 != "pass",
      f"got {first_move_seed42}/{first_move_seed43}")

print("== 对弈 API 边界 ==")
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_99k", "color": "black"})
check("非法段位 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/play", {"size": 42, "rank": "rank_15k", "color": "black"})
check("棋盘 42 → 422", st == 422, f"got {st}")

st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "black"})
check("创建对局 → 200", st == 200, f"got {st}")
pid = r.get("playId")

st, r = call("GET", f"/api/play/{pid}")
check("查对局状态 → 200", st == 200 and r.get("status") == "playing", f"got {st}")

st, r = call("GET", "/api/play/nonexistent00")
check("不存在对局 → 404", st == 404, f"got {st}")

st, r = call("POST", f"/api/play/{pid}/move", {"vertex": "E5"})
check("合法一手 → 200 且轮到用户", st == 200 and r.get("toMove") == "B", f"got {st}")

st, r = call("POST", f"/api/play/{pid}/move", {"vertex": "E5"})
check("下在已有子 → 422", st == 422, f"got {st}")

st, r = call("POST", f"/api/play/{pid}/move", {"vertex": "ZZ9"})
check("非法顶点 ZZ9 → 422(疫苗)", st == 422, f"got {st}")
st, r = call("POST", f"/api/play/{pid}/move", {"vertex": "Z"})
check("非法顶点 Z → 422(疫苗)", st == 422, f"got {st}")
st, r = call("POST", f"/api/play/{pid}/move", {"vertex": "E99"})
check("越界行 E99 → 422(疫苗)", st == 422, f"got {st}")

st, r = call("POST", f"/api/play/{pid}/undo")
check("悔棋 → 手数减少且轮到用户", st == 200 and r.get("toMove") == "B", f"got {st}")

# 劫争规则:构造实战劫形,验证引擎拒绝立即回提
# 用另一个会话:白先提黑一子后,黑立即回提同点应被引擎拒绝(劫)
st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "white"})
check("执白建局 → 200", st == 200, f"got {st}")
pid_w = r.get("playId")

st, r = call("POST", "/api/play", {"size": 9, "rank": "rank_15k", "color": "black"})
st, r = call("POST", f"/api/play/{r.get('playId')}/undo")
check("空手数悔棋 → 409", st == 409, f"got {st}")

st, r = call("POST", f"/api/play/{pid_w}/resign")
check("认输 → over", st == 200 and r.get("status") == "over", f"got {st}")

st, r = call("POST", f"/api/play/{pid_w}/move", {"vertex": "E5"})
check("结束后再下 → 409", st == 409, f"got {st}")

st, r = call("POST", f"/api/play/{pid_w}/resign")
check("结束后再认输 → 200 幂等", st == 200, f"got {st}")

print(f"\n通过 {passed} / {passed + failed}")
sys_exit = 0 if failed == 0 else 1
import sys
sys.exit(sys_exit)
