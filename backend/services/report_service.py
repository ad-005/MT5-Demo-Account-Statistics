import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend.config import REPORTS_FILE, DATA_DIR
from backend.models import Report, TradingStats, StatComparison


# Fields where higher values are better (True), lower is better (False),
# or direction doesn't matter (None/neutral)
HIGHER_IS_BETTER = {
    "total_trades": None,
    "winning_trades": True,
    "losing_trades": False,
    "win_rate": True,
    "buy_percentage": None,
    "sell_percentage": None,
    "total_profit": True,
    "total_loss": None,
    "net_profit": True,
    "average_profit": True,
    "average_loss": None,
    "largest_win": True,
    "largest_loss": None,
    "profit_factor": True,
    "sharpe_ratio": True,
    "sortino_ratio": True,
    "max_drawdown": False,
    "max_drawdown_pct": False,
    "average_trade": True,
    "expectancy": True,
    "consecutive_wins": True,
    "consecutive_losses": False,
    "risk_reward_ratio": True,
}


def _ensure_file():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not REPORTS_FILE.exists():
        REPORTS_FILE.write_text("[]")


def load_reports() -> list[Report]:
    _ensure_file()
    raw = json.loads(REPORTS_FILE.read_text())
    return [Report(**r) for r in raw]


def save_reports(reports: list[Report]):
    _ensure_file()
    REPORTS_FILE.write_text(
        json.dumps([r.model_dump() for r in reports], indent=2)
    )


def get_report(report_id: str) -> Optional[Report]:
    for r in load_reports():
        if r.id == report_id:
            return r
    return None


def list_reports(account_id: Optional[str] = None) -> list[Report]:
    reports = load_reports()
    if account_id:
        reports = [r for r in reports if r.account_id == account_id]
    return sorted(reports, key=lambda r: r.created_at, reverse=True)


def create_report(
    account_id: str,
    account_name: str,
    label: str,
    stats: TradingStats,
    trades_count: int,
    date_range_start: Optional[str] = None,
    date_range_end: Optional[str] = None,
    overall_score: Optional[int] = None,
    overall_grade: Optional[str] = None,
) -> Report:
    reports = load_reports()
    report = Report(
        id=str(uuid.uuid4()),
        account_id=account_id,
        account_name=account_name,
        label=label,
        created_at=datetime.now(timezone.utc).isoformat(),
        date_range_start=date_range_start,
        date_range_end=date_range_end,
        trades_count=trades_count,
        overall_score=overall_score,
        overall_grade=overall_grade,
        stats=stats,
    )
    reports.append(report)
    save_reports(reports)
    return report


def delete_report(report_id: str) -> bool:
    reports = load_reports()
    filtered = [r for r in reports if r.id != report_id]
    if len(filtered) == len(reports):
        return False
    save_reports(filtered)
    return True


def compare_stats(
    left_stats: TradingStats,
    right_stats: TradingStats,
    left_label: str,
    right_label: str,
    left_account: str,
    right_account: str,
) -> StatComparison:
    deltas = {}
    left_dict = left_stats.model_dump()
    right_dict = right_stats.model_dump()

    for field, higher_better in HIGHER_IS_BETTER.items():
        left_val = left_dict.get(field, 0)
        right_val = right_dict.get(field, 0)

        if not isinstance(left_val, (int, float)) or not isinstance(right_val, (int, float)):
            continue

        delta = right_val - left_val
        pct_change = (delta / abs(left_val) * 100) if left_val != 0 else None

        if higher_better is None:
            improved = None
        elif delta == 0:
            improved = None
        else:
            improved = (delta > 0) == higher_better

        deltas[field] = {
            "left": left_val,
            "right": right_val,
            "delta": round(delta, 4),
            "pct_change": round(pct_change, 2) if pct_change is not None else None,
            "improved": improved,
        }

    return StatComparison(
        left_label=left_label,
        right_label=right_label,
        left_account_name=left_account,
        right_account_name=right_account,
        left_stats=left_stats,
        right_stats=right_stats,
        deltas=deltas,
    )
