from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class AccountCreate(BaseModel):
    name: str
    login: int
    password: str
    server: str
    trade_mode: str = "demo"


class Account(AccountCreate):
    id: str
    container_port: Optional[int] = None


class AccountOut(BaseModel):
    id: str
    name: str
    login: int
    server: str
    trade_mode: str
    container_status: str = "unknown"


class TradeDirection(str, Enum):
    BUY = "buy"
    SELL = "sell"


class Trade(BaseModel):
    ticket: int
    symbol: str
    direction: TradeDirection
    volume: float
    open_price: float
    close_price: float
    open_time: str
    close_time: str
    profit: float
    swap: float
    commission: float
    comment: str = ""
    magic: int = 0


class TradeFilter(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    direction: Optional[TradeDirection] = None
    symbol: Optional[str] = None
    min_profit: Optional[float] = None
    max_profit: Optional[float] = None


class TradingStats(BaseModel):
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    buy_percentage: float = 0.0
    sell_percentage: float = 0.0
    total_profit: float = 0.0
    total_loss: float = 0.0
    net_profit: float = 0.0
    average_profit: float = 0.0
    average_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    average_trade: float = 0.0
    expectancy: float = 0.0
    consecutive_wins: int = 0
    consecutive_losses: int = 0
    risk_reward_ratio: float = 0.0
    session_win_rates: dict = Field(default_factory=dict)
    daily_win_rates: dict = Field(default_factory=dict)
    symbol_breakdown: dict = Field(default_factory=dict)


class DockerStatus(BaseModel):
    docker_available: bool
    daemon_running: bool = False
    image_built: bool = False
    message: str = ""


class ReportCreate(BaseModel):
    account_id: str
    label: str
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None
    overall_score: Optional[int] = None
    overall_grade: Optional[str] = None


class Report(BaseModel):
    id: str
    account_id: str
    account_name: str
    label: str
    created_at: str
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None
    trades_count: int = 0
    overall_score: Optional[int] = None
    overall_grade: Optional[str] = None
    stats: TradingStats


class StatComparison(BaseModel):
    left_label: str
    right_label: str
    left_account_name: str
    right_account_name: str
    left_stats: TradingStats
    right_stats: TradingStats
    deltas: dict
