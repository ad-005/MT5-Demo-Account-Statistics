import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

TIMEOUT = 30.0


async def fetch_trades(port: int, start_date: Optional[str] = None, end_date: Optional[str] = None) -> list[dict]:
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(f"http://localhost:{port}/trades", params=params)
        resp.raise_for_status()
        return resp.json()


async def fetch_account_info(port: int) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(f"http://localhost:{port}/account_info")
        resp.raise_for_status()
        return resp.json()


async def check_health(port: int) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"http://localhost:{port}/health")
            return resp.status_code == 200
    except Exception:
        return False
