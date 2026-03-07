from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from backend.models import Trade, TradeDirection
from backend.services import account_service, mt5_bridge_client

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("/{account_id}", response_model=list[Trade])
async def get_trades(
    account_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    direction: Optional[TradeDirection] = Query(None),
    symbol: Optional[str] = Query(None),
    min_profit: Optional[float] = Query(None),
    max_profit: Optional[float] = Query(None),
):
    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if not acc.container_port:
        raise HTTPException(400, "Container not running. Start it first.")

    try:
        raw_trades = await mt5_bridge_client.fetch_trades(
            acc.container_port, start_date, end_date
        )
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch trades from container: {e}")

    trades = [Trade(**t) for t in raw_trades]

    # Apply client-side filters
    if direction:
        trades = [t for t in trades if t.direction == direction]
    if symbol:
        trades = [t for t in trades if t.symbol.lower() == symbol.lower()]
    if min_profit is not None:
        trades = [t for t in trades if t.profit >= min_profit]
    if max_profit is not None:
        trades = [t for t in trades if t.profit <= max_profit]

    return trades
