"""
MT5 Bridge Server — runs on Linux side inside the Docker container.
Reads JSON files exported by the MQL5 DataExporter EA running inside
the MT5 terminal. Exposes trade data over HTTP so the main backend
can fetch it.
"""
import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MT5 Bridge")

# MT5 writes files to MQL5/Files/ directory. Set via env var by setup_and_run.sh.
MT5_FILES_DIR = Path(os.environ.get("MT5_FILES_DIR", "/tmp/mt5files"))

STATUS_FILE = "status.json"
ACCOUNT_FILE = "account_info.json"
TRADES_FILE = "trades.json"

# How long to wait for EA to produce data on startup (seconds)
STARTUP_TIMEOUT = int(os.environ.get("STARTUP_TIMEOUT", "300"))


def _read_json(filename: str) -> Optional[dict | list]:
    """Read and parse a JSON file from the MT5 Files directory."""
    filepath = MT5_FILES_DIR / filename
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
        logger.debug(f"Could not read {filepath}: {e}")
        return None


@app.on_event("startup")
async def startup():
    logger.info(f"Waiting for EA data in {MT5_FILES_DIR} (timeout={STARTUP_TIMEOUT}s)")
    for i in range(STARTUP_TIMEOUT):
        status = _read_json(STATUS_FILE)
        if status and status.get("status") == "ok":
            logger.info(f"EA data available after {i+1}s — login: {status.get('login')}")
            return
        await asyncio.sleep(1)
    logger.warning(f"EA data not available after {STARTUP_TIMEOUT}s — starting anyway")


@app.get("/health")
async def health():
    status = _read_json(STATUS_FILE)
    if status and status.get("status") == "ok":
        return {"status": "ok", "login": status.get("login")}
    return {"status": "degraded"}


@app.get("/account_info")
async def account_info():
    data = _read_json(ACCOUNT_FILE)
    if data:
        return data
    return {"error": "No account info available"}


@app.get("/trades")
async def get_trades(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    trades = _read_json(TRADES_FILE)
    if trades is None:
        return []

    # Apply date filtering if requested
    if start_date or end_date:
        filtered = []
        for trade in trades:
            close_time = trade.get("close_time", "")
            if not close_time:
                continue
            # Compare as strings — works because format is YYYY-MM-DD HH:MM:SS
            close_date = close_time[:10]
            if start_date and close_date < start_date:
                continue
            if end_date and close_date > end_date:
                continue
            filtered.append(trade)
        return filtered

    return trades


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)