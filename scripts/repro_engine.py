#!/usr/bin/env python3
"""直接调用 KataGoEngine 复现 analyze_stream 卡死问题。"""
import asyncio
import sys

sys.path.insert(0, "/Users/crazyrock/ZCodeProject/gotutor/backend")

from app.engine import KataGoEngine

QUERY = {
    "id": "t1",
    "moves": [["B", "E5"], ["W", "G5"]],
    "initialStones": [],
    "rules": "chinese",
    "komi": 5.5,
    "boardXSize": 9,
    "boardYSize": 9,
    "analyzeTurns": [0, 1],
    "maxVisits": 20,
    "includeOwnership": True,
}


async def main():
    eng = KataGoEngine("/opt/homebrew/bin/katago",
                       "/Users/crazyrock/ZCodeProject/gotutor/backend/models/kata1-b18c384nbt.bin.gz",
                       "/Users/crazyrock/ZCodeProject/gotutor/backend/analysis.cfg")
    await eng.start()
    await eng.wait_ready(120)
    print("engine ready", flush=True)
    print("query:", QUERY, flush=True)
    try:
        async with asyncio.timeout(30):
            n = 0
            async for rep in eng.analyze_stream(dict(QUERY), last_turn=1):
                n += 1
                print(f"got turn {rep.get('turn')} keys={sorted(rep.keys())[:6]}", flush=True)
            print(f"done, {n} turns", flush=True)
    except TimeoutError:
        print("TIMEOUT after 30s — 卡死复现", flush=True)
        print("proc returncode:", eng._proc.returncode, flush=True)
    finally:
        await eng.stop()


asyncio.run(main())
