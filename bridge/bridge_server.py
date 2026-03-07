"""
MT5 Bridge Server — runs on Linux side inside the Docker container.
Communicates with mt5_worker.py running under Wine's Python via subprocess stdin/stdout.
Exposes trade data over HTTP so the main backend can fetch it.
"""
import asyncio
import json
import logging
import os
from typing import Optional

from fastapi import FastAPI, Query
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MT5 Bridge")

_worker_proc: Optional[asyncio.subprocess.Process] = None
_worker_lock = asyncio.Lock()


async def _start_worker():
    global _worker_proc
    wine_python = os.environ.get(
        "WINE_PYTHON", "wine python"
    )
    cmd = f"{wine_python} /app/mt5_worker.py"
    _worker_proc = await asyncio.create_subprocess_shell(
        cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    logger.info(f"Worker started (pid={_worker_proc.pid})")


async def _send_command(cmd: str, params: dict = None) -> dict:
    async with _worker_lock:
        if _worker_proc is None or _worker_proc.returncode is not None:
            await _start_worker()

        request = json.dumps({"cmd": cmd, "params": params or {}}) + "\n"
        _worker_proc.stdin.write(request.encode())
        await _worker_proc.stdin.drain()

        line = await asyncio.wait_for(_worker_proc.stdout.readline(), timeout=30)
        if not line:
            return {"error": "Worker returned empty response"}

        return json.loads(line.decode())


@app.on_event("startup")
async def startup():
    # Wait for MT5 terminal to start up
    await asyncio.sleep(5)

    await _start_worker()

    # Initialize MT5 connection in the worker
    retries = 10
    for i in range(retries):
        try:
            result = await _send_command("init")
            if result.get("ok"):
                logger.info("MT5 worker initialized successfully")
                return
            logger.warning(f"MT5 init attempt {i+1}/{retries}: {result.get('error')}")
        except Exception as e:
            logger.warning(f"MT5 init attempt {i+1}/{retries} failed: {e}")
        await asyncio.sleep(3)
    logger.error("Failed to initialize MT5 worker after retries")


@app.on_event("shutdown")
async def shutdown():
    try:
        await _send_command("shutdown")
    except Exception:
        pass
    if _worker_proc and _worker_proc.returncode is None:
        _worker_proc.terminate()


@app.get("/health")
async def health():
    try:
        return await _send_command("health")
    except Exception:
        return {"status": "degraded"}


@app.get("/account_info")
async def account_info():
    return await _send_command("account_info")


@app.get("/trades")
async def get_trades(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    return await _send_command("trades", params)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)