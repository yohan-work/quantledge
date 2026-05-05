from app.data.price_loader import load_price_data
from app.data.ticker_loader import normalize_symbol
from app.schemas.backtest import BacktestRequest
from app.strategies.ma_strategy import run_moving_average_backtest


STRATEGY_PERIODS = {
    "ma20": 20,
    "ma60": 60,
}


def _build_data_quality(price_data, request: BacktestRequest, period: int) -> dict:
    first_valid_ma_date = None
    if len(price_data) >= period:
        first_valid_ma_date = str(price_data.iloc[period - 1]["date"])

    return {
        "requestedStartDate": request.startDate,
        "requestedEndDate": request.endDate,
        "actualStartDate": str(price_data.iloc[0]["date"]),
        "actualEndDate": str(price_data.iloc[-1]["date"]),
        "tradingDayCount": int(len(price_data)),
        "maWarmupDays": int(period - 1),
        "firstValidMaDate": first_valid_ma_date,
        "hasMissingOhlcv": bool(price_data[["open", "high", "low", "close"]].isna().any().any()),
    }


def run_backtest(request: BacktestRequest) -> dict:
    symbol = normalize_symbol(request.symbol)
    if request.strategyId not in {"ma", "ma20", "ma60"}:
        raise ValueError("현재 실행 가능한 전략은 이동평균선 전략입니다.")

    period = STRATEGY_PERIODS.get(request.strategyId, int(request.parameters.get("period", 20)))
    if period < 2:
        raise ValueError("이동평균 기간은 2 이상이어야 합니다.")

    price_load = load_price_data(symbol, request.startDate, request.endDate)
    result = run_moving_average_backtest(
        price_load.data,
        symbol=symbol,
        symbol_name=request.symbolName,
        period=period,
        initial_capital=request.initialCapital,
        commission_rate=request.commissionRate,
    )
    result["strategyId"] = request.strategyId
    result["dataSource"] = price_load.source
    result["dataQuality"] = _build_data_quality(price_load.data, request, period)
    return result
