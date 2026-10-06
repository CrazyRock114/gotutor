"""Gotutor API — AI 围棋复盘教学服务。"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .analysis import build_summary
from .engine import EngineError, EngineNotConfigured, KataGoEngine
from .play import RANK_LABELS, RANK_PROFILES, PlayStore, engine_reply, gtp_to_xy
from .runner import run_game_analysis
from .sgf import parse_sgf
from .store import GameStore

BACKEND_DIR = Path(__file__).resolve().parent.parent
KATAGO_BIN = os.environ.get("KATAGO_BIN", "/opt/homebrew/bin/katago")
KATAGO_MODEL = os.environ.get(
    "KATAGO_MODEL", str(BACKEND_DIR / "models" / "kata1-b18c384nbt.bin.gz")
)
KATAGO_CFG = os.environ.get("KATAGO_CFG", str(BACKEND_DIR / "analysis.cfg"))
MAX_MOVES = 600
DEMO_SGF = BACKEND_DIR / "demo" / "game.sgf"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

store = GameStore()
engine_state: dict = {"engine": None, "ready": False, "error": None}
play_store = PlayStore()
play_engine_state: dict = {"engine": None, "ready": False, "starting": None}

HUMAN_MODEL = os.environ.get(
    "KATAGO_HUMAN_MODEL", str(BACKEND_DIR / "models" / "b18c384nbt-humanv0.bin.gz")
)


async def _ensure_play_engine() -> KataGoEngine:
    """懒加载对弈引擎(human-SL 模型为主模型,输出人类棋风着法)。"""
    if play_engine_state["ready"]:
        return play_engine_state["engine"]
    if play_engine_state["starting"] is None:
        engine = KataGoEngine(KATAGO_BIN, HUMAN_MODEL, KATAGO_CFG)
        play_engine_state["engine"] = engine

        async def _start():
            await engine.start()
            await engine.wait_ready(600)
            play_engine_state["ready"] = True

        play_engine_state["starting"] = asyncio.create_task(_start())
    task = play_engine_state["starting"]
    await asyncio.wait_for(asyncio.shield(task), timeout=600)
    if not play_engine_state["ready"]:
        raise EngineNotConfigured("对弈引擎启动失败")
    return play_engine_state["engine"]


async def _init_engine() -> None:
    engine = KataGoEngine(KATAGO_BIN, KATAGO_MODEL, KATAGO_CFG)
    engine_state["engine"] = engine
    try:
        await engine.start()
        await engine.wait_ready(600)
        engine_state["ready"] = True
        logging.getLogger("gotutor").info("分析引擎就绪")
    except (EngineNotConfigured, asyncio.TimeoutError, OSError) as e:
        engine_state["error"] = str(e)
        logging.getLogger("gotutor").error("引擎启动失败:%s", e)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_init_engine())
    yield
    task.cancel()
    if engine_state["engine"]:
        await engine_state["engine"].stop()


app = FastAPI(title="Gotutor API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    sgf: str
    visits: int = Field(default=120, ge=20, le=2000)


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/api/health")
async def health():
    return {
        "ready": engine_state["ready"],
        "error": engine_state["error"],
        "model": Path(KATAGO_MODEL).name,
    }


@app.post("/api/games")
async def create_game(req: AnalyzeRequest):
    if not engine_state["ready"]:
        detail = engine_state["error"] or "分析引擎启动中,请稍候几秒后重试"
        raise HTTPException(status_code=503, detail=detail)

    try:
        info = parse_sgf(req.sgf.encode("utf-8"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if not info.moves:
        raise HTTPException(status_code=422, detail="棋谱中没有着法(仅有摆子)")
    if len(info.moves) > MAX_MOVES:
        raise HTTPException(status_code=422, detail=f"着法数超过上限 {MAX_MOVES} 手")

    gid = uuid.uuid4().hex[:12]
    store.create(gid, info.meta, info, req.visits)
    asyncio.create_task(run_game_analysis(engine_state["engine"], store, gid))
    return {
        "gameId": gid,
        "meta": info.meta,
        "boardSize": info.board_size,
        "komi": info.komi,
        "rules": info.rules,
        "handicap": info.handicap,
        "moveCount": len(info.moves),
        "visits": req.visits,
    }


@app.get("/api/games/{gid}")
async def game_snapshot(gid: str):
    game = store.get(gid)
    if game is None:
        raise HTTPException(status_code=404, detail="对局不存在(服务重启后分析结果不保留)")
    return {
        "gameId": game.gid,
        "meta": game.meta,
        "status": game.status,
        "error": game.error,
        "summary": game.summary,
        "visits": game.visits,
        "boardSize": game.info.board_size,
        "komi": game.info.komi,
        "rules": game.info.rules,
        "handicap": game.info.handicap,
        "initialStones": game.info.initial_stones,
        "moves": [{"player": c, "move": v} for c, v in game.info.moves],
        "turns": game.turns,
    }


@app.get("/api/games/{gid}/stream")
async def game_stream(gid: str):
    game = store.get(gid)
    if game is None:
        raise HTTPException(status_code=404, detail="对局不存在")

    async def gen():
        q = store.subscribe(gid)
        try:
            for t in list(game.turns):  # 断线重连:先补发已有结果
                yield _sse("turn", t)
            if game.status == "done":
                yield _sse("done", game.summary)
                return
            if game.status == "error":
                yield _sse("error", {"message": game.error})
                return
            while True:
                kind, payload = await q.get()
                yield _sse(kind, payload)
                if kind in ("done", "error"):
                    return
        finally:
            store.unsubscribe(gid, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/demo")
async def demo_sgf():
    if DEMO_SGF.exists():
        return {"sgf": DEMO_SGF.read_text("utf-8")}
    raise HTTPException(status_code=404, detail="示例棋谱缺失(运行 scripts/gen_demo.py)")


# ---------------- 对弈 ----------------

class PlayCreateRequest(BaseModel):
    size: int = Field(default=9, ge=2, le=19)
    rank: str = "rank_15k"
    color: str = Field(default="black", pattern="^(black|white)$")


class PlayMoveRequest(BaseModel):
    vertex: str  # GTP 顶点或 "pass"


@app.get("/api/play/meta")
async def play_meta():
    return {
        "ranks": [{"value": r, "label": RANK_LABELS[r]} for r in RANK_PROFILES],
    }


@app.post("/api/play")
async def play_create(req: PlayCreateRequest):
    if req.rank not in RANK_PROFILES:
        raise HTTPException(status_code=422, detail=f"不支持的段位档位:{req.rank}")
    try:
        engine = await _ensure_play_engine()
    except (EngineNotConfigured, asyncio.TimeoutError, OSError) as e:
        raise HTTPException(status_code=503, detail=f"对弈引擎未就绪:{e}") from e

    session = play_store.create(
        size=req.size, rank=req.rank,
        user_color="b" if req.color == "black" else "w",
        komi=7.5,
    )
    reply = None
    if session.to_move != session.user_color:  # 用户执白 → 引擎执黑先走
        try:
            vertex = await engine_reply(engine, session)
        except EngineError as e:
            raise HTTPException(status_code=500, detail=f"引擎错误:{e}") from e
        session.apply("b", None if vertex.lower() == "pass" else vertex)
        session.to_move = session.user_color
        session.last_engine_move = vertex
        reply = vertex
    state = session.state()
    state["reply"] = reply
    return state


@app.get("/api/play/{pid}")
async def play_state(pid: str):
    s = play_store.get(pid)
    if s is None:
        raise HTTPException(status_code=404, detail="对局不存在")
    return s.state()


@app.post("/api/play/{pid}/move")
async def play_move(pid: str, req: PlayMoveRequest):
    s = play_store.get(pid)
    if s is None:
        raise HTTPException(status_code=404, detail="对局不存在")
    if s.status != "playing":
        raise HTTPException(status_code=409, detail="对局已结束")
    if s.to_move != s.user_color:
        raise HTTPException(status_code=409, detail="还没轮到你")
    engine = await _ensure_play_engine()

    vertex = req.vertex.strip()
    user_gtp = None if vertex.lower() == "pass" else vertex
    if user_gtp is not None:
        try:
            gtp_to_xy(user_gtp, s.size)  # 格式校验(疫苗:ZZ9 类输入必须 422)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from None

    # 先在本地棋盘应用用户着法(占用/越界直接拒绝)
    try:
        s.apply(s.user_color, user_gtp)
    except ValueError:
        raise HTTPException(status_code=422, detail="非法着点:这里已有棋子") from None
    if s.passes >= 2:
        s.status = "over"
        s.result = "双方连续停着,对局结束(去复盘看胜负)"
        return s.state()

    try:
        reply_vertex = await engine_reply(engine, s)
    except EngineError as e:
        s.pop_move()  # 回滚用户着法
        detail = str(e)
        if "illegal" in detail.lower():
            raise HTTPException(status_code=422, detail="非法着点:这里不能下(禁入点/已占用/劫争)") from e
        raise HTTPException(status_code=500, detail=f"引擎错误:{detail}") from e

    ai_color = "w" if s.user_color == "b" else "b"
    ai_gtp = None if reply_vertex.lower() == "pass" else reply_vertex
    try:
        s.apply(ai_color, ai_gtp)
    except ValueError:
        pass  # 引擎着不应非法;万一发生则忽略
    s.to_move = s.user_color
    s.last_engine_move = reply_vertex

    if s.passes >= 2:
        s.status = "over"
        s.result = "双方连续停着,对局结束(去复盘看胜负)"
    state = s.state()
    state["reply"] = reply_vertex
    return state


@app.post("/api/play/{pid}/undo")
async def play_undo(pid: str):
    s = play_store.get(pid)
    if s is None:
        raise HTTPException(status_code=404, detail="对局不存在")
    if not s.moves:
        raise HTTPException(status_code=409, detail="没有可悔的棋")
    # 撤销到"轮到用户"为止:通常撤两手(AI + 用户);对局结束后也可悔
    s.status = "playing"
    s.result = None
    s.passes = 0
    popped = 0
    while s.moves and popped < 2:
        c, _ = s.pop_move()
        popped += 1
        if c == s.user_color:
            break
    s.to_move = s.user_color
    return s.state()


@app.post("/api/play/{pid}/resign")
async def play_resign(pid: str):
    s = play_store.get(pid)
    if s is None:
        raise HTTPException(status_code=404, detail="对局不存在")
    s.status = "over"
    s.result = "白中盘胜" if s.user_color == "b" else "黑中盘胜"
    return s.state()
