from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from backend.models import Report, ReportCreate, Trade, StatComparison
from backend.services import account_service, docker_service, mt5_bridge_client, stats_service, report_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", response_model=Report)
async def create_report(data: ReportCreate):
    acc = account_service.get_account(data.account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if not acc.container_port:
        raise HTTPException(400, "Container not running. Start it first.")

    await docker_service.ensure_port_forwarded(acc.container_port)

    try:
        raw_trades = await mt5_bridge_client.fetch_trades(
            acc.container_port, data.date_range_start, data.date_range_end
        )
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch trades from container: {e}")

    trades = [Trade(**t) for t in raw_trades]
    stats = stats_service.calculate_stats(trades)

    report = report_service.create_report(
        account_id=data.account_id,
        account_name=acc.name,
        label=data.label,
        stats=stats,
        trades_count=len(trades),
        date_range_start=data.date_range_start,
        date_range_end=data.date_range_end,
        overall_score=data.overall_score,
        overall_grade=data.overall_grade,
    )
    return report


@router.get("", response_model=list[Report])
async def list_reports(account_id: Optional[str] = Query(None)):
    return report_service.list_reports(account_id)


@router.get("/compare", response_model=StatComparison)
async def compare_reports(
    left_id: str = Query(...),
    right_id: str = Query(...),
):
    left = report_service.get_report(left_id)
    if not left:
        raise HTTPException(404, "Left report not found")
    right = report_service.get_report(right_id)
    if not right:
        raise HTTPException(404, "Right report not found")

    return report_service.compare_stats(
        left.stats, right.stats,
        left.label, right.label,
        left.account_name, right.account_name,
    )


@router.get("/compare-live", response_model=StatComparison)
async def compare_live(
    report_id: str = Query(...),
    account_id: str = Query(...),
):
    report = report_service.get_report(report_id)
    if not report:
        raise HTTPException(404, "Report not found")

    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if not acc.container_port:
        raise HTTPException(400, "Container not running. Start it to compare with live stats.")

    await docker_service.ensure_port_forwarded(acc.container_port)

    try:
        raw_trades = await mt5_bridge_client.fetch_trades(acc.container_port)
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch trades from container: {e}")

    trades = [Trade(**t) for t in raw_trades]
    live_stats = stats_service.calculate_stats(trades)

    return report_service.compare_stats(
        report.stats, live_stats,
        report.label, f"{acc.name} (Live)",
        report.account_name, acc.name,
    )


@router.get("/{report_id}", response_model=Report)
async def get_report(report_id: str):
    report = report_service.get_report(report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report


@router.delete("/{report_id}")
async def delete_report(report_id: str):
    if not report_service.delete_report(report_id):
        raise HTTPException(404, "Report not found")
    return {"status": "ok"}
