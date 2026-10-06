#!/usr/bin/env python3
"""ownership 朝向验证:黑棋占满 9 路盘顶行,检查数组头部还是尾部为强正值。"""
import json
import time
import urllib.request

SGF = "(;GM[1]FF[4]SZ[9]KM[0]AB[aa][ba][ca][da][ea][fa][ga][ha][ia];W[ee];B[ge])"

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/games",
    data=json.dumps({"sgf": SGF, "visits": 30}).encode(),
    headers={"Content-Type": "application/json"},
)
gid = json.load(urllib.request.urlopen(req))["gameId"]
print("gameId:", gid)

for _ in range(30):
    d = json.load(urllib.request.urlopen(f"http://127.0.0.1:8000/api/games/{gid}"))
    if d["status"] != "running":
        break
    time.sleep(2)

t = d["turns"][0]
own = t["ownership"]
print("wrB:", t["winrateBlack"], "slB:", t["scoreLeadBlack"])
print("前9 (若≈+1 → 数组从顶行 A9 起):", own[:9])
print("后9 (若≈+1 → 数组从底行 A1 起):", own[-9:])
