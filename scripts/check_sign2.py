#!/usr/bin/env python3
"""ownership 符号约定定论:同一局中比较 turn0(白行棋)与 turn1(黑行棋)的 own[0](黑子A9)。"""
import json
import time
import urllib.request

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/games",
    data=json.dumps({"sgf": "(;GM[1]FF[4]SZ[9]KM[7.5]AB[aa];W[ee];B[ii])", "visits": 30}).encode(),
    headers={"Content-Type": "application/json"},
)
gid = json.load(urllib.request.urlopen(req))["gameId"]
for _ in range(30):
    d = json.load(urllib.request.urlopen(f"http://127.0.0.1:8000/api/games/{gid}"))
    if d["status"] != "running":
        break
    time.sleep(2)

for t in d["turns"][:2]:
    own = t["ownership"]
    print(f"turn{t['turn']} 行棋方={t['player']} own[0](黑子A9)={own[0]} own[40](E5)={own[40]}")
