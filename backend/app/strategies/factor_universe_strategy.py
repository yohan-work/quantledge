"""
다종목 월간 리밸런싱 팩터 엔진 (docs/10.md 구조 정렬).

- 유동성: 최근 20거래일 평균 거래대금 하한 (원)
- ranking_mode=momentum: 12-1 가격 모멘텀 순위
- ranking_mode=value_quality: pykrx 일별 PER/PBR/EPS/BPS + 지연(asof) 후 저PER 순위
  (영업이익·부채비율은 KRX 스냅샷 미제공 → EPS>0, EPS/BPS 프록시, 부채 필터는 미적용)
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Literal

import numpy as np
import pandas as pd

from app.backtest.metrics import calculate_cagr, calculate_mdd
from app.data.fundamental_loader import build_fundamental_panel_asof, stack_metric_panel
from app.data.price_loader import PriceLoadResult, load_index_price_data, load_price_data
from app.data.universe_loader import UniverseMarket, load_krx_market_cap_universe

RankingMode = Literal["momentum", "value_quality"]


def _extended_start(start_date: str, days_back: int = 450) -> str:
    dt = datetime.strptime(start_date, "%Y-%m-%d")
    return (dt - timedelta(days=days_back)).strftime("%Y-%m-%d")


def _load_universe_close_matrix(
    universe: list[tuple[str, str]],
    start_date: str,
    end_date: str,
    *,
    max_workers: int = 6,
) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    """종가·거래대금 매트릭스 (date x symbol).

    실전 유니버스에는 기간 중 데이터가 끊긴 종목이 섞일 수 있다.
    전체 기간을 유지하고, 리밸런싱 시점에 필요한 가격·유동성이 있는 종목만 편입 대상으로 삼는다.
    """
    closes: dict[str, pd.Series] = {}
    tvalues: dict[str, pd.Series] = {}
    source = "naver"

    def fetch(sym: str) -> tuple[str, PriceLoadResult]:
        return sym, load_price_data(sym, start_date, end_date)

    loads: dict[str, PriceLoadResult] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = [pool.submit(fetch, sym) for sym, _ in universe]
        for fut in as_completed(futs):
            sym, load = fut.result()
            loads[sym] = load

    for symbol, _ in universe:
        load = loads[symbol]
        source = load.source
        df = load.data.set_index("date")
        closes[symbol] = df["close"]
        tv = df["tradingValue"] if "tradingValue" in df.columns else df["close"] * df["volume"]
        tvalues[symbol] = tv

    close_df = pd.DataFrame(closes).sort_index()
    tv_df = pd.DataFrame(tvalues).reindex(close_df.index)
    valid = close_df.notna().any(axis=1) & tv_df.notna().any(axis=1)
    close_df = close_df.loc[valid]
    tv_df = tv_df.loc[valid]
    if close_df.empty:
        raise ValueError("유니버스 종목들의 거래일 데이터가 없습니다. 기간이나 유니버스 조건을 확인해 주세요.")

    return close_df, tv_df, source


def _clean_float(value: float) -> float:
    if not np.isfinite(value):
        return 0.0
    return float(value)


def _strategy_note_value_quality(lag: int) -> str:
    return (
        "벤치마크는 동일 유니버스·동일 시점에 분할 매수한 뒤 비중을 더 이상 맞추지 않는 "
        "‘초기 동일금액 buy&hold’입니다. 밸류·퀄리티 모드는 pykrx 일별 투자지표(PER·PBR·EPS·BPS)를 사용하며, "
        f"리밸 시점보다 {lag}거래일 이전에 관측된 스냅샷만 사용합니다(asof·ffill). "
        "시작일 이전 데이터는 지표 워밍업에만 쓰고, 실제 리밸런싱은 시작일 이후 월말부터 실행합니다. "
        "영업이익·회계 ROE·부채비율은 KRX 스냅샷에 없어 각각 EPS>0, EPS/BPS, (부채 미필터)로 대체했습니다. "
        "정밀 룩백은 OpenDART 등 별도 데이터가 필요합니다."
    )


def _strategy_note_momentum() -> str:
    return (
        "벤치마크는 동일 유니버스·동일 시점에 분할 매수한 뒤 비중을 더 이상 맞추지 않는 "
        "‘초기 동일금액 buy&hold’입니다. 모멘텀 모드는 12-1 가격 수익률 순위입니다. "
        "시작일 이전 데이터는 지표 워밍업에만 쓰고, 실제 리밸런싱은 시작일 이후 월말부터 실행합니다."
    )


def run_monthly_universe_factor_backtest(
    *,
    user_start_date: str,
    user_end_date: str,
    initial_capital: float,
    commission_rate: float,
    universe: list[tuple[str, str]] | None = None,
    top_k: int = 5,
    liquidity_window: int = 20,
    min_avg_trading_value: float = 5_000_000_000.0,
    momentum_long: int = 252,
    momentum_skip: int = 21,
    ranking_mode: RankingMode = "momentum",
    fundamental_lag_days: int = 20,
    universe_market: UniverseMarket = "KOSPI",
    universe_size: int = 30,
    min_universe_trading_value: float = 5_000_000_000.0,
    use_market_trend_filter: bool = False,
    market_trend_index: str = "KOSPI",
    market_trend_period: int = 200,
    use_individual_trend_filter: bool = False,
    individual_trend_period: int = 120,
) -> dict:
    universe_label_override = None
    if universe is None:
        uni, universe_label_override = load_krx_market_cap_universe(
            reference_date=user_start_date,
            market=universe_market,
            top_n=universe_size,
            min_trading_value=min_universe_trading_value,
        )
    else:
        uni = universe
    symbols = [s for s, _ in uni]
    ext_start = _extended_start(user_start_date)

    close_df, tv_df, data_source = _load_universe_close_matrix(uni, ext_start, user_end_date)
    dates = close_df.index.tolist()
    n = len(dates)
    n_sym = len(symbols)

    avg_tv = tv_df.rolling(liquidity_window).mean()
    individual_ma = close_df.rolling(individual_trend_period).mean()
    idx_dt = pd.to_datetime(close_df.index)
    ym = idx_dt.to_period("M")
    month_end_flags = np.zeros(n, dtype=bool)
    for i in range(n - 1):
        if ym[i] != ym[i + 1]:
            month_end_flags[i] = True
    month_end_flags[n - 1] = True

    close_arr = close_df.to_numpy(dtype=float)
    avg_tv_arr = avg_tv.to_numpy(dtype=float)
    individual_ma_arr = individual_ma.to_numpy(dtype=float)

    market_ok = np.ones(n, dtype=bool)
    if use_market_trend_filter:
        index_load = load_index_price_data(market_trend_index, ext_start, user_end_date)
        index_close = index_load.data.set_index("date")["close"].reindex(close_df.index).ffill()
        index_ma = index_close.rolling(market_trend_period).mean()
        market_ok = ((index_close > index_ma) & index_ma.notna()).fillna(False).to_numpy(dtype=bool)

    daily_ret = np.zeros((n, n_sym))
    for i in range(1, n):
        prev = close_arr[i - 1]
        cur = close_arr[i]
        with np.errstate(divide="ignore", invalid="ignore"):
            valid_price = np.isfinite(prev) & np.isfinite(cur) & (prev > 0) & (cur > 0)
            daily_ret[i] = np.where(valid_price, cur / prev - 1.0, 0.0)

    per_arr = pbr_arr = eps_arr = bps_arr = None
    if ranking_mode == "value_quality":
        panels = build_fundamental_panel_asof(uni, dates, ext_start, user_end_date)
        per_arr = stack_metric_panel(panels, "PER", symbols).to_numpy(dtype=float)
        pbr_arr = stack_metric_panel(panels, "PBR", symbols).to_numpy(dtype=float)
        eps_arr = stack_metric_panel(panels, "EPS", symbols).to_numpy(dtype=float)
        bps_arr = stack_metric_panel(panels, "BPS", symbols).to_numpy(dtype=float)

    w = np.zeros(n_sym)
    w_prev = np.zeros(n_sym)
    strat_equity = np.zeros(n)
    strat_equity[0] = initial_capital

    start_idx = next((k for k, d in enumerate(dates) if d >= user_start_date), 0)
    buy_hold_prices = close_df.ffill().fillna(0.0).to_numpy(dtype=float)
    p_bh0 = buy_hold_prices[start_idx]
    notional_each_bh = initial_capital / n_sym
    shares_bh = np.where(p_bh0 > 0, notional_each_bh / p_bh0, 0.0)
    bh_equity = np.array([float(np.dot(shares_bh, buy_hold_prices[i])) for i in range(n)])

    if ranking_mode == "momentum":
        min_rebalance_ix = momentum_long + momentum_skip
        warmup_display = min_rebalance_ix
    else:
        min_rebalance_ix = max(liquidity_window - 1, fundamental_lag_days)
        warmup_display = min_rebalance_ix

    first_alloc = False
    trade_events = 0
    leg_trade_count = 0
    action_history = ["CASH"] * n
    reason_history = ["첫 리밸런싱 전이라 현금 대기 중입니다."] * n
    weight_history = np.zeros((n, n_sym))

    for i in range(1, n):
        cost_drag = 0.0
        rebalanced = False
        picked_names: list[str] = []
        if i - 1 >= min_rebalance_ix and dates[i - 1] >= user_start_date and month_end_flags[i - 1]:
            ix = i - 1
            eligible: list[tuple[float, int]] = []
            w_new = np.zeros(n_sym)

            if use_market_trend_filter and not market_ok[ix]:
                picked_names = []
            elif ranking_mode == "momentum":
                for j, _sym in enumerate(symbols):
                    liq = avg_tv_arr[ix, j]
                    if np.isnan(liq) or liq < min_avg_trading_value:
                        continue
                    p_old = close_arr[ix - momentum_skip, j]
                    p_long = close_arr[ix - momentum_skip - momentum_long, j]
                    if not np.isfinite(p_old) or not np.isfinite(p_long) or p_old <= 0 or p_long <= 0:
                        continue
                    if use_individual_trend_filter:
                        p_now = close_arr[ix, j]
                        p_ma = individual_ma_arr[ix, j]
                        if not np.isfinite(p_now) or not np.isfinite(p_ma) or p_now <= p_ma:
                            continue
                    mom = p_old / p_long - 1.0
                    eligible.append((mom, j))
                eligible.sort(key=lambda x: x[0], reverse=True)
            else:
                lag_ix = max(0, ix - fundamental_lag_days)
                for j, _sym in enumerate(symbols):
                    liq = avg_tv_arr[ix, j]
                    if np.isnan(liq) or liq < min_avg_trading_value:
                        continue
                    if use_individual_trend_filter:
                        p_now = close_arr[ix, j]
                        p_ma = individual_ma_arr[ix, j]
                        if not np.isfinite(p_now) or not np.isfinite(p_ma) or p_now <= p_ma:
                            continue
                    per = per_arr[lag_ix, j] if per_arr is not None else np.nan
                    pbr = pbr_arr[lag_ix, j] if pbr_arr is not None else np.nan
                    eps = eps_arr[lag_ix, j] if eps_arr is not None else np.nan
                    bps = bps_arr[lag_ix, j] if bps_arr is not None else np.nan
                    if np.isnan(per) or np.isnan(pbr) or np.isnan(eps) or np.isnan(bps):
                        continue
                    if not (per > 0 and pbr > 0 and eps > 0 and bps > 0):
                        continue
                    roe_proxy = eps / bps
                    if not (roe_proxy > 0):
                        continue
                    eligible.append((per, j))
                eligible.sort(key=lambda x: x[0])

            if eligible:
                picked = [j for _, j in eligible[:top_k]]
                if picked:
                    # Top K는 목표 투자 슬롯 수다. 필터로 일부 슬롯이 비면 그 비중은 현금으로 둔다.
                    inv = 1.0 / top_k
                    for j in picked:
                        w_new[j] = inv
                    picked_names = [f"{uni[j][1]}({uni[j][0]})" for j in picked]
                    if len(picked) < top_k:
                        picked_names.append(f"현금 {top_k - len(picked)}/{top_k} 슬롯")
            turnover = float(np.sum(np.abs(w_new - w_prev)))
            if turnover > 0:
                cost_drag = turnover * commission_rate
                leg_trade_count += int(np.count_nonzero(np.abs(w_new - w_prev) > 1e-12))
                w = w_new
                w_prev = w_new.copy()
                first_alloc = True
                trade_events += 1
                rebalanced = True
            elif not first_alloc and np.sum(w_new) > 0:
                turnover = float(np.sum(np.abs(w_new - w_prev)))
                cost_drag = turnover * commission_rate
                leg_trade_count += int(np.count_nonzero(np.abs(w_new - w_prev) > 1e-12))
                w = w_new
                w_prev = w_new.copy()
                first_alloc = True
                trade_events += 1
                rebalanced = True

        if not first_alloc:
            r_p = 0.0
        else:
            r_p = float(np.dot(w, daily_ret[i])) - cost_drag
        strat_equity[i] = strat_equity[i - 1] * (1.0 + r_p)
        weight_history[i] = w

        if rebalanced:
            if float(np.sum(w)) > 0:
                action_history[i] = "BUY"
                reason_history[i] = (
                    "월말 리밸런싱 반영일입니다. "
                    f"선정 종목: {', '.join(picked_names) if picked_names else '없음'}."
                )
            else:
                action_history[i] = "SELL"
                reason_history[i] = "방어 필터 또는 편입 조건 미충족으로 현금 대기합니다."
        elif first_alloc:
            action_history[i] = "HOLD"
            current = [f"{uni[j][1]}({uni[j][0]})" for j, weight in enumerate(w) if weight > 0]
            reason_history[i] = (
                "직전 리밸런싱에서 정한 동일비중 포트폴리오를 유지합니다. "
                f"현재 편입: {', '.join(current) if current else '없음'}."
            )
        else:
            action_history[i] = "CASH"
            reason_history[i] = "12-1 모멘텀 또는 팩터 계산에 필요한 워밍업 전이라 현금 대기 중입니다."

    out_dates = [d for d in dates if d >= user_start_date]
    if not out_dates:
        raise ValueError("요청한 시작일 이후 거래일이 없습니다.")

    start_idx = dates.index(out_dates[0])
    eq_s = strat_equity[start_idx:].copy()
    eq_bh = bh_equity[start_idx:].copy()
    out_dates_list = dates[start_idx:]
    if eq_s[0] > 0:
        eq_s = eq_s / eq_s[0] * initial_capital
    if eq_bh[0] > 0:
        eq_bh = eq_bh / eq_bh[0] * initial_capital

    strategy_peak = np.maximum.accumulate(eq_s)
    strategy_dd = eq_s / np.maximum(strategy_peak, 1e-12) - 1.0
    bh_peak = np.maximum.accumulate(eq_bh)
    bh_dd = eq_bh / np.maximum(bh_peak, 1e-12) - 1.0

    start_date = out_dates_list[0]
    end_date = out_dates_list[-1]
    final_capital = float(eq_s[-1])
    buy_hold_final = float(eq_bh[-1])
    out_weights = weight_history[start_idx:]
    invested_weights = np.sum(out_weights, axis=1)
    cash_weights = np.clip(1.0 - invested_weights, 0.0, 1.0)
    holding_counts = np.count_nonzero(out_weights > 1e-12, axis=1)
    portfolio_stats = {
        "averageCashWeight": float(np.mean(cash_weights)),
        "maxCashWeight": float(np.max(cash_weights)),
        "averageHoldingCount": float(np.mean(holding_counts)),
        "minHoldingCount": int(np.min(holding_counts)),
        "maxHoldingCount": int(np.max(holding_counts)),
    }

    equity_curve = [
        {"date": d, "strategyEquity": float(eq_s[k]), "buyAndHoldEquity": float(eq_bh[k])}
        for k, d in enumerate(out_dates_list)
    ]
    drawdown_curve = [
        {
            "date": d,
            "strategyDrawdown": float(strategy_dd[k]),
            "buyAndHoldDrawdown": float(bh_dd[k]),
        }
        for k, d in enumerate(out_dates_list)
    ]

    universe_label = universe_label_override or ", ".join(f"{name}({code})" for code, name in uni[:4])
    if universe_label_override is None and len(uni) > 4:
        universe_label += f" 외 {len(uni) - 4}종"

    if ranking_mode == "momentum":
        strat_name = "유동성 + 12-1 모멘텀 월간 리밸런싱"
        signal_note = "포트폴리오: 월말 12-1 모멘텀 상위·유동성 필터·동일비중."
    else:
        strat_name = (
            f"유동성 + 저PER(pykrx) 월간 리밸런싱 (지연 {fundamental_lag_days}거래일)"
        )
        signal_note = (
            f"포트폴리오: 월말 저PER 순·EPS/BPS>0 등 퀄리티 프록시·"
            f"{fundamental_lag_days}거래일 지연 스냅샷·유동성 필터."
        )

    signals = []
    ref_col = 0
    for k, d in enumerate(out_dates_list):
        ix_g = start_idx + k
        reason = f"{reason_history[ix_g]} {signal_note}"
        signals.append(
            {
                "date": d,
                "action": action_history[ix_g],
                "close": _clean_float(close_arr[ix_g, ref_col]),
                "movingAverage": None,
                "ma20": None,
                "position": 1 if float(np.sum(weight_history[ix_g])) > 0 else 0,
                "reason": reason,
            }
        )

    note_body = (
        _strategy_note_value_quality(fundamental_lag_days)
        if ranking_mode == "value_quality"
        else _strategy_note_momentum()
    )
    ranking_line = f"순위 방식: {ranking_mode}. "
    filter_notes = []
    if use_market_trend_filter:
        filter_notes.append(f"시장 필터: {market_trend_index} {market_trend_period}일선 위에서만 투자.")
    if use_individual_trend_filter:
        filter_notes.append(
            f"개별 필터: 종목 종가가 {individual_trend_period}일선 위일 때만 편입하고, "
            "탈락한 Top K 슬롯은 현금으로 유지."
        )
    filter_line = " ".join(filter_notes)

    return {
        "strategyId": "low-per-quality",
        "strategyName": strat_name,
        "symbol": "UNIVERSE",
        "symbolName": f"동일유니버스 {len(uni)}종",
        "startDate": start_date,
        "endDate": end_date,
        "initialCapital": float(initial_capital),
        "finalCapital": final_capital,
        "totalReturn": final_capital / initial_capital - 1,
        "cagr": calculate_cagr(initial_capital, final_capital, start_date, end_date),
        "mdd": calculate_mdd(pd.Series(strategy_dd)),
        "tradeCount": int(leg_trade_count),
        "buyAndHold": {
            "finalCapital": buy_hold_final,
            "totalReturn": buy_hold_final / initial_capital - 1,
            "cagr": calculate_cagr(initial_capital, buy_hold_final, start_date, end_date),
            "mdd": calculate_mdd(pd.Series(bh_dd)),
        },
        "portfolioStats": portfolio_stats,
        "priceData": [],
        "equityCurve": equity_curve,
        "drawdownCurve": drawdown_curve,
        "signals": signals,
        "displayKind": "portfolio",
        "dataSource": data_source,
        "dataQuality": {
            "requestedStartDate": user_start_date,
            "requestedEndDate": user_end_date,
            "actualStartDate": start_date,
            "actualEndDate": end_date,
            "tradingDayCount": int(len(out_dates_list)),
            "maWarmupDays": int(warmup_display),
            "firstValidMaDate": out_dates_list[0] if len(out_dates_list) > warmup_display else None,
            "hasMissingOhlcv": bool(close_df.isna().any().any() or tv_df.isna().any().any()),
            "universeDescription": universe_label,
            "rebalanceMonths": int(trade_events),
            "strategyNote": " ".join(part for part in [ranking_line, filter_line, note_body] if part),
        },
    }
