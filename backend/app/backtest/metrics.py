from datetime import datetime

import pandas as pd


def calculate_cagr(initial_capital: float, final_capital: float, start_date: str, end_date: str) -> float:
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    days = max((end - start).days, 1)
    years = days / 365.25
    return (final_capital / initial_capital) ** (1 / years) - 1


def calculate_mdd(drawdown: pd.Series) -> float:
    return float(drawdown.min())
