import asyncio
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

TIMEOUT = 30.0

# Retry settings for transient connection failures (Colima SSH port-forwarding
# can drop momentarily under heavy QEMU load).
MAX_RETRIES = 3
RETRY_BACKOFF = 1.0  # seconds; doubled each retry


async def _request_with_retry(
    method: str,
    url: str,
    *,
    timeout: float = TIMEOUT,
    params: dict | None = None,
) -> httpx.Response:
    """Make an HTTP request with retry on transient connection errors.

    Retries on ConnectError, RemoteProtocolError (empty reply / connection
    reset), and ReadTimeout — all symptoms of Colima SSH tunnel instability
    or a container that briefly dropped its listener.
    """
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, params=params)
                resp.raise_for_status()
                return resp
        except (
            httpx.ConnectError,
            httpx.RemoteProtocolError,
            httpx.ReadTimeout,
        ) as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF * (2 ** attempt)
                logger.warning(
                    "Bridge request %s %s attempt %d failed (%s), retrying in %.1fs",
                    method, url, attempt + 1, exc, wait,
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    "Bridge request %s %s failed after %d attempts: %s",
                    method, url, MAX_RETRIES, exc,
                )
    raise last_exc  # type: ignore[misc]


async def fetch_trades(port: int, start_date: Optional[str] = None, end_date: Optional[str] = None) -> list[dict]:
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date

    resp = await _request_with_retry("GET", f"http://localhost:{port}/trades", params=params)
    return resp.json()


async def fetch_account_info(port: int) -> dict:
    resp = await _request_with_retry("GET", f"http://localhost:{port}/account_info")
    return resp.json()


async def check_health(port: int) -> bool:
    try:
        resp = await _request_with_retry("GET", f"http://localhost:{port}/health", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False
