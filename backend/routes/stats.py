from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from backend.models import Trade, TradingStats
from backend.services import account_service, docker_service, mt5_bridge_client, stats_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/{account_id}", response_model=TradingStats)
async def get_stats(
    account_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if not acc.container_port:
        raise HTTPException(400, "Container not running. Start it first.")

    # Ensure Colima port forwarding hasn't dropped (ARM Mac QEMU workaround)
    await docker_service.ensure_port_forwarded(acc.container_port)

    try:
        raw_trades = await mt5_bridge_client.fetch_trades(
            acc.container_port, start_date, end_date
        )
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch trades from container: {e}")

    trades = [Trade(**t) for t in raw_trades]
    return stats_service.calculate_stats(trades)
