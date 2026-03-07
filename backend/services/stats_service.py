from datetime import datetime, timezone
from backend.models import Trade, TradingStats, TradeDirection
import numpy as np


def _parse_dt(s: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.fromisoformat(s)


def _get_session(dt: datetime) -> str:
    hour = dt.hour
    if 0 <= hour < 9:
        return "Asian"
    elif 9 <= hour < 13:
        return "London"
    elif 13 <= hour < 17:
        return "New York"
    elif 17 <= hour < 21:
        return "New York PM"
    else:
        return "Asian"


def _get_day_name(dt: datetime) -> str:
    return dt.strftime("%A")


def calculate_stats(trades: list[Trade]) -> TradingStats:
    if not trades:
        return TradingStats()

    total = len(trades)
    profits = [t.profit + t.swap + t.commission for t in trades]
    winners = [p for p in profits if p > 0]
    losers = [p for p in profits if p <= 0]

    buys = [t for t in trades if t.direction == TradeDirection.BUY]
    sells = [t for t in trades if t.direction == TradeDirection.SELL]

    total_profit = sum(winners) if winners else 0.0
    total_loss = abs(sum(losers)) if losers else 0.0

    # Sharpe ratio (annualized, assuming daily returns)
    returns = np.array(profits)
    sharpe = 0.0
    if len(returns) > 1 and np.std(returns) > 0:
        sharpe = (np.mean(returns) / np.std(returns)) * np.sqrt(252)

    # Sortino ratio
    sortino = 0.0
    downside = returns[returns < 0]
    if len(downside) > 0 and np.std(downside) > 0:
        sortino = (np.mean(returns) / np.std(downside)) * np.sqrt(252)

    # Max drawdown
    cumulative = np.cumsum(returns)
    running_max = np.maximum.accumulate(cumulative)
    drawdowns = running_max - cumulative
    max_dd = float(np.max(drawdowns)) if len(drawdowns) > 0 else 0.0
    max_dd_pct = (max_dd / float(np.max(running_max))) * 100 if np.max(running_max) > 0 else 0.0

    # Consecutive wins/losses
    max_consec_wins = 0
    max_consec_losses = 0
    current_wins = 0
    current_losses = 0
    for p in profits:
        if p > 0:
            current_wins += 1
            current_losses = 0
            max_consec_wins = max(max_consec_wins, current_wins)
        else:
            current_losses += 1
            current_wins = 0
            max_consec_losses = max(max_consec_losses, current_losses)

    # Session win rates
    session_trades: dict[str, list[float]] = {}
    for t in trades:
        try:
            dt = _parse_dt(t.open_time)
            session = _get_session(dt)
            net = t.profit + t.swap + t.commission
            session_trades.setdefault(session, []).append(net)
        except Exception:
            continue

    session_win_rates = {}
    for session, pnls in session_trades.items():
        wins = sum(1 for p in pnls if p > 0)
        session_win_rates[session] = round((wins / len(pnls)) * 100, 2) if pnls else 0.0

    # Daily win rates
    daily_trades: dict[str, list[float]] = {}
    for t in trades:
        try:
            dt = _parse_dt(t.open_time)
            day = _get_day_name(dt)
            net = t.profit + t.swap + t.commission
            daily_trades.setdefault(day, []).append(net)
        except Exception:
            continue

    daily_win_rates = {}
    for day, pnls in daily_trades.items():
        wins = sum(1 for p in pnls if p > 0)
        daily_win_rates[day] = round((wins / len(pnls)) * 100, 2) if pnls else 0.0

    # Symbol breakdown
    symbol_data: dict[str, dict] = {}
    for t in trades:
        net = t.profit + t.swap + t.commission
        if t.symbol not in symbol_data:
            symbol_data[t.symbol] = {"trades": 0, "wins": 0, "pnl": 0.0}
        symbol_data[t.symbol]["trades"] += 1
        symbol_data[t.symbol]["pnl"] += net
        if net > 0:
            symbol_data[t.symbol]["wins"] += 1

    symbol_breakdown = {}
    for sym, data in symbol_data.items():
        symbol_breakdown[sym] = {
            "trades": data["trades"],
            "win_rate": round((data["wins"] / data["trades"]) * 100, 2),
            "pnl": round(data["pnl"], 2),
        }

    avg_win = (total_profit / len(winners)) if winners else 0.0
    avg_loss = (total_loss / len(losers)) if losers else 0.0
    win_rate = (len(winners) / total) * 100

    return TradingStats(
        total_trades=total,
        winning_trades=len(winners),
        losing_trades=len(losers),
        win_rate=round(win_rate, 2),
        buy_percentage=round((len(buys) / total) * 100, 2),
        sell_percentage=round((len(sells) / total) * 100, 2),
        total_profit=round(total_profit, 2),
        total_loss=round(total_loss, 2),
        net_profit=round(sum(profits), 2),
        average_profit=round(avg_win, 2),
        average_loss=round(avg_loss, 2),
        largest_win=round(max(profits), 2) if profits else 0.0,
        largest_loss=round(min(profits), 2) if profits else 0.0,
        profit_factor=round(total_profit / total_loss, 2) if total_loss > 0 else 0.0,
        sharpe_ratio=round(float(sharpe), 2),
        sortino_ratio=round(float(sortino), 2),
        max_drawdown=round(max_dd, 2),
        max_drawdown_pct=round(max_dd_pct, 2),
        average_trade=round(sum(profits) / total, 2),
        expectancy=round(
            (win_rate / 100 * avg_win) - ((1 - win_rate / 100) * avg_loss), 2
        ),
        consecutive_wins=max_consec_wins,
        consecutive_losses=max_consec_losses,
        risk_reward_ratio=round(avg_win / avg_loss, 2) if avg_loss > 0 else 0.0,
        session_win_rates=session_win_rates,
        daily_win_rates=daily_win_rates,
        symbol_breakdown=symbol_breakdown,
    )
