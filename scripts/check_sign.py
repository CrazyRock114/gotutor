#!/usr/bin/env python3
"""决定性实验:单黑子 A9(左上) vs A1(左下),检查 ownership 四角值与 currentPlayer。"""
import json
import time
import urllib.request


def analyze(sgf, visits=20):
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/games",
        data=json.dumps({"sgf": sgf, "visits": visits}).encode(),
        headers={"Content-Type": "application/json"},
    )
    gid = json.load(urllib.request.urlopen(req))["gameId"]
    for _ in range(30):
        d = json.load(urllib.request.urlopen(f"http://127.0.0.1:8000/api/games/{gid}"))
        if d["status"] != "running":
            break
        time.sleep(2)
    return d


# 黑子 A9(9路左上),加两手普通着法(白 E5、黑 J1)
d = analyze("(;GM[1]FF[4]SZ[9]KM[7.5]AB[aa];W[ee];B[ii])")
t = d["turns"][0]
own = t["ownership"]
print("== 黑子 A9 ==")
print("wrB:", t["winrateBlack"], "| own[0](A9):", own[0], "| own[8](J9):", own[8],
      "| own[-9](A1):", own[-9], "| own[-1](J1):", own[-1])

# 黑子 A1(9路左下)
d = analyze("(;GM[1]FF[4]SZ[9]KM[7.5]AB[ai];W[ee];B[ii])")
t = d["turns"][0]
own = t["ownership"]
print("== 黑子 A1 ==")
print("wrB:", t["winrateBlack"], "| own[0](A9):", own[0], "| own[8](J9):", own[8],
      "| own[-9](A1):", own[-9], "| own[-1](J1):", own[-1])
