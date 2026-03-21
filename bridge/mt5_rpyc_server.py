"""
MT5 RPyC Server — runs under Wine Python with the MetaTrader5 package.
Exposes MT5 functions via RPyC over TCP so Linux Python can call them.
"""
import json
import os
import sys
from datetime import datetime, timezone

import rpyc
from rpyc.utils.server import ThreadedServer
import MetaTrader5 as mt5


class MT5Service(rpyc.Service):

    def exposed_initialize(self):
        login = int(os.environ.get("MT5_LOGIN", "0"))
        password = os.environ.get("MT5_PASSWORD", "")
        server = os.environ.get("MT5_SERVER", "")

        if not mt5.initialize():
            err = mt5.last_error()
            return json.dumps({"ok": False, "error": f"initialize failed: {err}"})

        if login:
            if not mt5.login(login, password=password, server=server):
                err = mt5.last_error()
                return json.dumps({"ok": False, "error": f"login failed: {err}"})

        return json.dumps({"ok": True})

    def exposed_shutdown(self):
        mt5.shutdown()
        return json.dumps({"ok": True})

    def exposed_account_info(self):
        info = mt5.account_info()
        if not info:
            return json.dumps({"error": "No account info"})
        return json.dumps({
            "login": info.login,
            "server": info.server,
            "balance": info.balance,
            "equity": info.equity,
            "margin": info.margin,
            "free_margin": info.margin_free,
            "leverage": info.leverage,
            "currency": info.currency,
            "name": info.name,
        })

    def exposed_get_trades(self, start_date_str=None, end_date_str=None):
        if start_date_str:
            start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        else:
            start_dt = datetime(2020, 1, 1, tzinfo=timezone.utc)

        if end_date_str:
            end_dt = datetime.strptime(end_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        else:
            end_dt = datetime.now(timezone.utc)

        deals = mt5.history_deals_get(start_dt, end_dt)
        if deals is None:
            return json.dumps([])

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

        return json.dumps(trades)

    def exposed_health(self):
        info = mt5.account_info()
        if info:
            return json.dumps({"status": "ok", "login": info.login})
        return json.dumps({"status": "degraded"})


if __name__ == "__main__":
    port = int(os.environ.get("RPYC_PORT", "18812"))
    print(f"Starting MT5 RPyC server on port {port}...", flush=True)
    server = ThreadedServer(
        MT5Service,
        port=port,
        protocol_config={
            "allow_public_attrs": True,
            "sync_request_timeout": 120,
        },
    )
    server.start()
