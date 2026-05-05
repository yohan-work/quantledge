from typing import Any, Literal

from pydantic import BaseModel, Field


class BacktestRequest(BaseModel):
    strategyId: Literal[
        "ma",
        "ma20",
        "ma60",
        "golden-cross",
        "regime-ma",
        "low-per-quality",
        "portfolio-rebalance",
    ] = "ma20"
    symbol: str = Field(default="005930", min_length=5, max_length=12)
    symbolName: str = "삼성전자"
    startDate: str = "2023-01-01"
    endDate: str = "2024-01-31"
    initialCapital: float = Field(default=10_000_000, gt=0)
    commissionRate: float = Field(default=0.0, ge=0, le=0.05)
    parameters: dict[str, Any] = Field(default_factory=lambda: {"period": 20})


class PricePoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    tradingValue: float | None = None
    movingAverage: float | None = None
    ma5: float | None = None
    ma20: float | None = None
    ma60: float | None = None
    ma120: float | None = None


class EquityPoint(BaseModel):
    date: str
    strategyEquity: float
    buyAndHoldEquity: float


class DrawdownPoint(BaseModel):
    date: str
    strategyDrawdown: float
    buyAndHoldDrawdown: float


class TradeSignal(BaseModel):
    date: str
    action: Literal["BUY", "SELL", "HOLD", "CASH"]
    close: float
    movingAverage: float | None = None
    ma20: float | None = None
    position: Literal[0, 1]
    reason: str


class BuyAndHoldSummary(BaseModel):
    finalCapital: float
    totalReturn: float
    cagr: float
    mdd: float


class DataQuality(BaseModel):
    requestedStartDate: str
    requestedEndDate: str
    actualStartDate: str
    actualEndDate: str
    tradingDayCount: int
    maWarmupDays: int
    firstValidMaDate: str | None = None
    hasMissingOhlcv: bool
    universeDescription: str | None = None
    rebalanceMonths: int | None = None
    strategyNote: str | None = None


class BacktestResponse(BaseModel):
    strategyId: str
    strategyName: str
    symbol: str
    symbolName: str
    startDate: str
    endDate: str
    initialCapital: float
    finalCapital: float
    totalReturn: float
    cagr: float
    mdd: float
    tradeCount: int
    buyAndHold: BuyAndHoldSummary
    dataSource: Literal["krx", "naver", "fdr"]
    dataQuality: DataQuality
    displayKind: Literal["single", "portfolio"] = "single"
    priceData: list[PricePoint] = Field(default_factory=list)
    equityCurve: list[EquityPoint]
    drawdownCurve: list[DrawdownPoint]
    signals: list[TradeSignal]


class ErrorResponse(BaseModel):
    error: bool = True
    message: str
    detail: str | None = None
