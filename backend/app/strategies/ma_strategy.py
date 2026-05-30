import numpy as np
import pandas as pd

from app.backtest.metrics import calculate_cagr, calculate_mdd
from app.backtest.costs import CostModel


def _clean_number(value: float | int | None) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _action_reason(action: str) -> str:
    if action == "BUY":
        return "전 거래일 종가가 이동평균선 위로 올라와 오늘부터 보유 상태로 전환됩니다."
    if action == "SELL":
        return "전 거래일 종가가 이동평균선 아래로 내려가 오늘부터 현금 상태로 전환됩니다."
    if action == "HOLD":
        return "전 거래일 신호가 보유 조건을 유지합니다."
    return "전 거래일 신호가 현금 대기 조건을 유지합니다."


def run_moving_average_backtest(
    price_data: pd.DataFrame,
    *,
    symbol: str,
    symbol_name: str,
    period: int,
    initial_capital: float,
    cost_model: CostModel,
) -> dict:
    if len(price_data) < period + 2:
        raise ValueError("이동평균선과 다음 날 포지션을 계산하기에 가격 데이터가 부족합니다.")

    df = price_data.copy()
    df["ma"] = df["close"].rolling(period).mean()
    df["ma5"] = df["close"].rolling(5).mean()
    df["ma20"] = df["close"].rolling(20).mean()
    df["ma60"] = df["close"].rolling(60).mean()
    df["ma120"] = df["close"].rolling(120).mean()
    df["signal"] = np.where(df["close"] > df["ma"], 1, 0)
    df.loc[df["ma"].isna(), "signal"] = 0
    df["position"] = df["signal"].shift(1).fillna(0).astype(int)
    df["daily_return"] = df["close"].pct_change().fillna(0)
    df["strategy_return"] = df["daily_return"] * df["position"]
    df["buy_hold_return"] = df["daily_return"]
    df["position_change"] = df["position"].diff().abs().fillna(0)
    df["previous_position"] = df["position"].shift(1).fillna(0).astype(int)
    df["buy_trade"] = ((df["previous_position"] == 0) & (df["position"] == 1)).astype(int)
    df["sell_trade"] = ((df["previous_position"] == 1) & (df["position"] == 0)).astype(int)
    df["cost"] = (
        df["position_change"] * cost_model.round_trip_rate
        + df["buy_trade"] * cost_model.buy_tax_rate
        + df["sell_trade"] * cost_model.sell_tax_rate
    )
    df["strategy_return_after_cost"] = df["strategy_return"] - df["cost"]
    df["strategy_equity"] = initial_capital * (1 + df["strategy_return_after_cost"]).cumprod()
    df["buy_hold_equity"] = initial_capital * (1 + df["buy_hold_return"]).cumprod()
    df["strategy_peak"] = df["strategy_equity"].cummax()
    df["strategy_drawdown"] = df["strategy_equity"] / df["strategy_peak"] - 1
    df["buy_hold_peak"] = df["buy_hold_equity"].cummax()
    df["buy_hold_drawdown"] = df["buy_hold_equity"] / df["buy_hold_peak"] - 1
    conditions = [
        (df["previous_position"] == 0) & (df["position"] == 1),
        (df["previous_position"] == 1) & (df["position"] == 0),
        df["position"] == 1,
    ]
    choices = ["BUY", "SELL", "HOLD"]
    df["action"] = np.select(conditions, choices, default="CASH")

    start_date = str(df.iloc[0]["date"])
    end_date = str(df.iloc[-1]["date"])
    final_capital = float(df.iloc[-1]["strategy_equity"])
    buy_hold_final = float(df.iloc[-1]["buy_hold_equity"])

    price_points = [
        {
            "date": row.date,
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
            "volume": float(row.volume),
            "tradingValue": _clean_number(row.tradingValue),
            "movingAverage": _clean_number(row.ma),
            "ma5": _clean_number(row.ma5),
            "ma20": _clean_number(row.ma20),
            "ma60": _clean_number(row.ma60),
            "ma120": _clean_number(row.ma120),
        }
        for row in df.itertuples(index=False)
    ]

    equity_curve = [
        {
            "date": row.date,
            "strategyEquity": float(row.strategy_equity),
            "buyAndHoldEquity": float(row.buy_hold_equity),
        }
        for row in df.itertuples(index=False)
    ]

    drawdown_curve = [
        {
            "date": row.date,
            "strategyDrawdown": float(row.strategy_drawdown),
            "buyAndHoldDrawdown": float(row.buy_hold_drawdown),
        }
        for row in df.itertuples(index=False)
    ]

    signals = [
        {
            "date": row.date,
            "action": row.action,
            "close": float(row.close),
            "movingAverage": _clean_number(row.ma),
            "ma20": _clean_number(row.ma),
            "position": int(row.position),
            "reason": _action_reason(row.action),
        }
        for row in df.itertuples(index=False)
    ]

    return {
        "strategyId": "ma",
        "strategyName": f"{period}일 이동평균선 전략",
        "symbol": symbol,
        "symbolName": symbol_name,
        "startDate": start_date,
        "endDate": end_date,
        "initialCapital": float(initial_capital),
        "finalCapital": final_capital,
        "totalReturn": final_capital / initial_capital - 1,
        "cagr": calculate_cagr(initial_capital, final_capital, start_date, end_date),
        "mdd": calculate_mdd(df["strategy_drawdown"]),
        "tradeCount": int(df["position_change"].sum()),
        "buyAndHold": {
            "finalCapital": buy_hold_final,
            "totalReturn": buy_hold_final / initial_capital - 1,
            "cagr": calculate_cagr(initial_capital, buy_hold_final, start_date, end_date),
            "mdd": calculate_mdd(df["buy_hold_drawdown"]),
        },
        "priceData": price_points,
        "equityCurve": equity_curve,
        "drawdownCurve": drawdown_curve,
        "signals": signals,
    }
