"""KataGo analysis engine 异步封装(JSON 行协议,见 KataGo docs/Analysis_Engine.md)。"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
from collections import deque
from pathlib import Path

log = logging.getLogger("gotutor.engine")

READY_MARKER = "Started, ready to begin handling requests"


class EngineError(RuntimeError):
    pass


class EngineNotConfigured(RuntimeError):
    pass


class KataGoEngine:
    def __init__(self, binary: str, model: str, config: str):
        self.binary = binary
        self.model = model
        self.config = config
        self._proc: asyncio.subprocess.Process | None = None
        self._ready = asyncio.Event()
        self._stderr_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._stderr_tail: deque[str] = deque(maxlen=15)

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    @property
    def ready(self) -> bool:
        return self._ready.is_set() and self.running

    async def start(self) -> None:
        if not (Path(self.binary).exists() or shutil.which(self.binary)):
            raise EngineNotConfigured(f"未找到 KataGo 可执行文件:{self.binary}")
        if not Path(self.model).exists():
            raise EngineNotConfigured(f"未找到模型权重:{self.model}(运行 scripts/setup_engine.sh 下载)")
        if not Path(self.config).exists():
            raise EngineNotConfigured(f"未找到配置文件:{self.config}")

        self._proc = await asyncio.create_subprocess_exec(
            str(self.binary), "analysis",
            "-config", str(self.config), "-model", str(self.model),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._stderr_task = asyncio.create_task(self._drain_stderr())
        log.info("KataGo 进程已启动(pid=%s),等待引擎就绪…", self._proc.pid)

    async def _drain_stderr(self) -> None:
        proc = self._proc
        while proc is not None:
            line = await proc.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", "replace").rstrip()
            self._stderr_tail.append(text)
            if not self._ready.is_set() and READY_MARKER in text:
                self._ready.set()
                log.info("KataGo 就绪")
            log.debug("katago| %s", text)
        if not self._ready.is_set():
            log.error("KataGo 启动失败,stderr 末尾:%s", " | ".join(list(self._stderr_tail)[-3:]))

    async def wait_ready(self, timeout: float = 600.0) -> None:
        ready_task = asyncio.ensure_future(self._ready.wait())
        exit_task = asyncio.ensure_future(self._proc.wait())
        try:
            await asyncio.wait(
                {ready_task, exit_task}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            for t in (ready_task, exit_task):
                t.cancel()
        if self._ready.is_set():
            return
        tail = " | ".join(list(self._stderr_tail)[-4:])
        raise EngineNotConfigured(f"KataGo 未能启动:{tail or '进程提前退出(检查配置/模型)'}")

    async def analyze_stream(self, query: dict, last_turn: int):
        """串行执行一个分析查询;按 turn 逐个产出结果 dict。

        last_turn: analyzeTurns 的最大值;收到该 turn 的报告后视为查询完成。
        """
        async with self._lock:
            if not self.running:
                raise EngineError("KataGo 进程未运行")
            qid = query["id"]
            self._proc.stdin.write((json.dumps(query, separators=(",", ":")) + "\n").encode())
            await self._proc.stdin.drain()
            completed = False
            try:
                while True:
                    line = await self._proc.stdout.readline()
                    if not line:
                        raise EngineError("KataGo 进程意外退出")
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        log.warning("无法解析引擎输出:%r", line[:200])
                        continue
                    if obj.get("id") != qid:
                        continue
                    if "error" in obj:
                        raise EngineError(obj["error"])
                    if obj.get("action") == "response":
                        return
                    yield obj
                    # 输出字段是 turnNumber(见 Analysis_Engine.md),收到最后一个 turn 即完成
                    if obj.get("turnNumber") == last_turn:
                        completed = True
                        return
            finally:
                if not completed and self.running:
                    # 消费方提前退出时终止引擎内部的搜索
                    try:
                        self._proc.stdin.write(
                            (json.dumps({"action": "terminate", "id": qid}) + "\n").encode()
                        )
                    except (BrokenPipeError, RuntimeError):
                        pass

    async def stop(self) -> None:
        if self.running:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), 10)
            except asyncio.TimeoutError:
                self._proc.kill()
        if self._stderr_task:
            self._stderr_task.cancel()
