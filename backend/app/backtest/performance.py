from __future__ import annotations

import math

import numpy as np
import pandas as pd


TRADING_DAYS_PER_YEAR = 252


def _as_float_series(values: pd.Series | list[float]) -> pd.Series:
    series = pd.Series(values, dtype=float).replace([np.inf, -np.inf], np.nan).dropna()
    return series.astype(float)


def calculate_annualized_volatility(returns: pd.Series | list[float]) -> float:
    series = _as_float_series(returns)
    if len(series) < 2:
        return 0.0
    return float(series.std(ddof=0) * math.sqrt(TRADING_DAYS_PER_YEAR))


def calculate_sharpe_ratio(
    returns: pd.Series | list[float],
    *,
    risk_free_rate: float = 0.0,
) -> float:
    series = _as_float_series(returns)
    if series.empty:
        return 0.0

    excess_returns = series - (risk_free_rate / TRADING_DAYS_PER_YEAR)
    std = float(excess_returns.std(ddof=0))
    if std == 0:
        return 0.0
    return float(excess_returns.mean() / std * math.sqrt(TRADING_DAYS_PER_YEAR))


def calculate_win_rate(returns: pd.Series | list[float]) -> float:
    series = _as_float_series(returns)
    if series.empty:
        return 0.0
    return float((series > 0).mean())


def calculate_max_consecutive_loss_days(returns: pd.Series | list[float]) -> int:
    series = _as_float_series(returns)
    max_run = 0
    current_run = 0
    for value in series:
        if value < 0:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 0
    return int(max_run)


def calculate_recovery_days(equity: pd.Series | list[float]) -> int | None:
    series = _as_float_series(equity)
    if series.empty:
        return None

    equity_values = series.to_numpy(dtype=float)
    peaks = np.maximum.accumulate(equity_values)
    drawdowns = np.divide(
        equity_values,
        np.maximum(peaks, 1e-12),
    ) - 1.0
    trough_index = int(np.argmin(drawdowns))
    peak_value = float(peaks[trough_index])
    peak_indices = np.where(equity_values[: trough_index + 1] >= peak_value - 1e-12)[0]
    if len(peak_indices) == 0:
        return None
    peak_index = int(peak_indices[-1])

    recovered_indices = np.where(equity_values[trough_index + 1 :] >= peak_value - 1e-12)[0]
    if len(recovered_indices) == 0:
        return None

    recovery_index = trough_index + 1 + int(recovered_indices[0])
    return int(recovery_index - peak_index)


def build_performance_metrics(
    equity: pd.Series | list[float],
    returns: pd.Series | list[float] | None = None,
) -> dict[str, float | int | None]:
    equity_series = _as_float_series(equity)
    if returns is None:
        returns_series = equity_series.pct_change().fillna(0.0)
    else:
        returns_series = _as_float_series(returns)
    return {
        "annualizedVolatility": calculate_annualized_volatility(returns_series),
        "sharpeRatio": calculate_sharpe_ratio(returns_series),
        "winRate": calculate_win_rate(returns_series),
        "maxConsecutiveLossDays": calculate_max_consecutive_loss_days(returns_series),
        "recoveryDays": calculate_recovery_days(equity_series),
    }
