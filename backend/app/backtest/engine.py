from typing import cast

from app.backtest.costs import parse_cost_model
from app.data.price_loader import load_price_data
from app.data.ticker_loader import normalize_symbol
from app.data.universe_loader import UniverseMarket
from app.schemas.backtest import BacktestRequest
from app.strategies.factor_universe_strategy import RankingMode, run_monthly_universe_factor_backtest
from app.strategies.golden_cross_strategy import run_golden_cross_backtest
from app.strategies.ma_strategy import run_moving_average_backtest
from app.strategies.regime_ma_strategy import run_regime_ma_backtest


STRATEGY_PERIODS = {
    "ma20": 20,
    "ma60": 60,
}


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


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


def _cost_summary(cost_model) -> str:
    return (
        "거래비용 모델: "
        f"수수료 {cost_model.commission_rate:.4%}, "
        f"슬리피지 {cost_model.slippage_rate:.4%}, "
        f"매도세금 {cost_model.sell_tax_rate:.4%}, "
        f"매수세금 {cost_model.buy_tax_rate:.4%}"
    )


def run_backtest(request: BacktestRequest) -> dict:
    params = request.parameters or {}
    cost_model = parse_cost_model(params, commission_rate=request.commissionRate)

    if request.strategyId in {"low-per-quality", "portfolio-rebalance"}:
        top_k = int(params.get("topK", params.get("top_k", 5)))
        min_tv = float(
            params.get(
                "minAvgTradingValue",
                params.get("minUniverseTradingValue", params.get("min_universe_trading_value", 5_000_000_000.0)),
            )
        )
        universe_size = int(params.get("universeSize", params.get("universe_size", 30)))
        if universe_size < 1:
            raise ValueError("universeSize는 1 이상이어야 합니다.")
        if top_k > universe_size:
            raise ValueError("편입 종목 수(topK)는 유니버스 크기보다 클 수 없습니다.")
        universe_market = str(params.get("universeMarket", params.get("universe_market", "KOSPI"))).upper()
        if universe_market not in ("KOSPI", "KOSDAQ", "ALL"):
            raise ValueError("universeMarket은 KOSPI, KOSDAQ, ALL 중 하나여야 합니다.")
        min_universe_tv = float(
            params.get("minUniverseTradingValue", params.get("min_universe_trading_value", 5_000_000_000.0))
        )
        use_market_filter = _as_bool(params.get("useMarketTrendFilter", params.get("use_market_trend_filter", False)))
        market_filter_index = str(params.get("marketTrendIndex", params.get("market_trend_index", "KOSPI"))).upper()
        market_filter_period = int(params.get("marketTrendPeriod", params.get("market_trend_period", 200)))
        use_individual_filter = _as_bool(
            params.get("useIndividualTrendFilter", params.get("use_individual_trend_filter", False))
        )
        individual_filter_period = int(
            params.get("individualTrendPeriod", params.get("individual_trend_period", 120))
        )
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
            top_k=top_k,
            cost_model=cost_model,
            min_avg_trading_value=min_tv,
            ranking_mode=cast(RankingMode, ranking_mode),
            fundamental_lag_days=fund_lag,
            universe_market=cast(UniverseMarket, universe_market),
            universe_size=universe_size,
            min_universe_trading_value=min_universe_tv,
            use_market_trend_filter=use_market_filter,
            market_trend_index=market_filter_index,
            market_trend_period=market_filter_period,
            use_individual_trend_filter=use_individual_filter,
            individual_trend_period=individual_filter_period,
        )
        result["strategyId"] = request.strategyId
        if request.strategyId == "portfolio-rebalance":
            if ranking_mode == "value_quality":
                result["strategyName"] = f"유니버스 월간 리밸런싱 (저PER·pykrx, 지연 {fund_lag}일)"
            else:
                result["strategyName"] = "유니버스 월간 리밸런싱 (유동성·12-1 모멘텀)"
        result["dataQuality"]["strategyNote"] = " ".join(
            part for part in [result["dataQuality"].get("strategyNote"), _cost_summary(cost_model)] if part
        )
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
            cost_model=cost_model,
        )
        result["strategyId"] = request.strategyId
        result["dataSource"] = price_load.source
        result["dataQuality"] = _build_data_quality(price_load.data, request, long_p)
        result["dataQuality"]["strategyNote"] = _cost_summary(cost_model)
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
            cost_model=cost_model,
        )
        result["strategyId"] = request.strategyId
        result["dataSource"] = price_load.source
        result["dataQuality"] = _build_data_quality(price_load.data, request, max_p)
        result["dataQuality"]["strategyNote"] = _cost_summary(cost_model)
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
        cost_model=cost_model,
    )
    result["strategyId"] = request.strategyId
    result["dataSource"] = price_load.source
    result["dataQuality"] = _build_data_quality(price_load.data, request, period)
    result["dataQuality"]["strategyNote"] = _cost_summary(cost_model)
    result["displayKind"] = "single"
    return result
