"""
MT5 Worker — runs under Wine's Python with the MetaTrader5 package.
Communicates with the Linux-side bridge server via stdin/stdout JSON lines.
"""
import sys
import json
import os
from datetime import datetime, timezone

import MetaTrader5 as mt5


def init():
    login = int(os.environ.get("MT5_LOGIN", "0"))
    password = os.environ.get("MT5_PASSWORD", "")
    server = os.environ.get("MT5_SERVER", "")

    if not mt5.initialize():
        return {"ok": False, "error": f"initialize failed: {mt5.last_error()}"}

    if login:
        if not mt5.login(login, password=password, server=server):
            return {"ok": False, "error": f"login failed: {mt5.last_error()}"}

    return {"ok": True}


def account_info():
    info = mt5.account_info()
    if not info:
        return {"error": "No account info"}
    return {
        "login": info.login,
        "server": info.server,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "free_margin": info.margin_free,
        "leverage": info.leverage,
        "currency": info.currency,
        "name": info.name,
    }


def get_trades(params):
    start_str = params.get("start_date")
    end_str = params.get("end_date")

    if start_str:
        start_dt = datetime.strptime(start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start_dt = datetime(2020, 1, 1, tzinfo=timezone.utc)

    if end_str:
        end_dt = datetime.strptime(end_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        end_dt = datetime.now(timezone.utc)

    deals = mt5.history_deals_get(start_dt, end_dt)
    if deals is None:
        return []

    trades = []
    positions = {}

    for deal in deals:
        if deal.entry == 0:
            positions[deal.position_id] = deal
        elif deal.entry == 1:
            entry = positions.get(deal.position_id)
            direction = "buy" if deal.type == 1 else "sell"
            if entry:
                direction = "buy" if entry.type == 0 else "sell"

            trades.append({
                "ticket": deal.ticket,
                "symbol": deal.symbol,
                "direction": direction,
                "volume": deal.volume,
                "open_price": entry.price if entry else 0.0,
                "close_price": deal.price,
                "open_time": datetime.fromtimestamp(
                    entry.time, tz=timezone.utc
                ).strftime("%Y-%m-%d %H:%M:%S") if entry else "",
                "close_time": datetime.fromtimestamp(
                    deal.time, tz=timezone.utc
                ).strftime("%Y-%m-%d %H:%M:%S"),
                "profit": deal.profit,
                "swap": deal.swap,
                "commission": deal.commission,
                "comment": deal.comment,
                "magic": deal.magic,
            })

    return trades


def handle(request):
    cmd = request.get("cmd")
    params = request.get("params", {})

    if cmd == "init":
        return init()
    elif cmd == "account_info":
        return account_info()
    elif cmd == "trades":
        return get_trades(params)
    elif cmd == "health":
        info = mt5.account_info()
        if info:
            return {"status": "ok", "login": info.login}
        return {"status": "degraded"}
    elif cmd == "shutdown":
        mt5.shutdown()
        return {"ok": True}
    else:
        return {"error": f"unknown command: {cmd}"}


if __name__ == "__main__":
    # Read JSON commands from stdin, write JSON responses to stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            result = handle(request)
            sys.stdout.write(json.dumps(result) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + "\n")
            sys.stdout.flush()