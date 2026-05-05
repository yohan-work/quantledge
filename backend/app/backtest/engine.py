from typing import cast

from app.data.price_loader import load_price_data
from app.data.ticker_loader import normalize_symbol
from app.schemas.backtest import BacktestRequest
from app.strategies.factor_universe_strategy import RankingMode, run_monthly_universe_factor_backtest
from app.strategies.golden_cross_strategy import run_golden_cross_backtest
from app.strategies.ma_strategy import run_moving_average_backtest
from app.strategies.regime_ma_strategy import run_regime_ma_backtest


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
        "universeDescription": None,
        "rebalanceMonths": None,
        "strategyNote": None,
    }


def run_backtest(request: BacktestRequest) -> dict:
    params = request.parameters or {}

    if request.strategyId in {"low-per-quality", "portfolio-rebalance"}:
        top_k = int(params.get("topK", params.get("top_k", 5)))
        min_tv = float(params.get("minAvgTradingValue", 5_000_000_000.0))
        raw_mode = params.get("rankingMode", params.get("ranking_mode"))
        if raw_mode is None:
            ranking_mode = "value_quality" if request.strategyId == "low-per-quality" else "momentum"
        else:
            ranking_mode = str(raw_mode).strip().lower().replace("-", "_")
            if ranking_mode == "valuequality":
                ranking_mode = "value_quality"
        if ranking_mode not in ("momentum", "value_quality"):
            raise ValueError("rankingMode는 momentum 또는 value_quality 여야 합니다.")

        fund_lag = int(params.get("fundamentalLagDays", params.get("fundamental_lag_days", 20)))
        if fund_lag < 0:
            raise ValueError("fundamentalLagDays는 0 이상이어야 합니다.")

        result = run_monthly_universe_factor_backtest(
            user_start_date=request.startDate,
            user_end_date=request.endDate,
            initial_capital=request.initialCapital,
            commission_rate=request.commissionRate,
            top_k=top_k,
            min_avg_trading_value=min_tv,
            ranking_mode=cast(RankingMode, ranking_mode),
            fundamental_lag_days=fund_lag,
        )
        result["strategyId"] = request.strategyId
        if request.strategyId == "portfolio-rebalance":
            if ranking_mode == "value_quality":
                result["strategyName"] = f"유니버스 월간 리밸런싱 (저PER·pykrx, 지연 {fund_lag}일)"
            else:
                result["strategyName"] = "유니버스 월간 리밸런싱 (유동성·12-1 모멘텀)"
        return result

    symbol = normalize_symbol(request.symbol)

    if request.strategyId == "golden-cross":
        short_p = int(params.get("shortPeriod", params.get("short_period", 20)))
        long_p = int(params.get("longPeriod", params.get("long_period", 60)))
        price_load = load_price_data(symbol, request.startDate, request.endDate)
        result = run_golden_cross_backtest(
            price_load.data,
            symbol=symbol,
            symbol_name=request.symbolName,
            short_period=short_p,
            long_period=long_p,
            initial_capital=request.initialCapital,
            commission_rate=request.commissionRate,
        )
        result["strategyId"] = request.strategyId
        result["dataSource"] = price_load.source
        result["dataQuality"] = _build_data_quality(price_load.data, request, long_p)
        result.setdefault("displayKind", "single")
        return result

    if request.strategyId == "regime-ma":
        filter_p = int(params.get("filterPeriod", params.get("filter_period", 200)))
        signal_p = int(params.get("signalPeriod", params.get("signal_period", 20)))
        price_load = load_price_data(symbol, request.startDate, request.endDate)
        max_p = max(filter_p, signal_p)
        result = run_regime_ma_backtest(
            price_load.data,
            symbol=symbol,
            symbol_name=request.symbolName,
            filter_period=filter_p,
            signal_period=signal_p,
            initial_capital=request.initialCapital,
            commission_rate=request.commissionRate,
        )
        result["strategyId"] = request.strategyId
        result["dataSource"] = price_load.source
        result["dataQuality"] = _build_data_quality(price_load.data, request, max_p)
        result.setdefault("displayKind", "single")
        return result

    if request.strategyId not in {"ma", "ma20", "ma60"}:
        raise ValueError("지원하지 않는 전략입니다.")

    period = STRATEGY_PERIODS.get(request.strategyId, int(params.get("period", 20)))
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
    result["displayKind"] = "single"
    return result
