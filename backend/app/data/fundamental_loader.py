"""pykrx 일별 투자지표(BPS, PER, PBR, EPS 등) 로드 — 가격 캘린더에 맞춰 asof(과거만) 정렬."""

from __future__ import annotations

from functools import lru_cache
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import redirect_stdout
from importlib import import_module
from io import StringIO

import numpy as np
import pandas as pd

from app import config as _config  # noqa: F401
from app.utils.date_utils import to_pykrx_date

_matplotlib_cache = os.path.join(tempfile.gettempdir(), "quantledge-matplotlib")
os.makedirs(_matplotlib_cache, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", _matplotlib_cache)


def _import_pykrx_stock():
    with redirect_stdout(StringIO()):
        return import_module("pykrx.stock")


FUND_COLUMNS = ("BPS", "PER", "PBR", "EPS", "DIV", "DPS")


def load_fundamental_series(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    종목별 일자 인덱스 투자지표. 인덱스는 ISO 날짜 문자열.
    KRX 스냅샷에 없는 지표는 컬럼만 두고 NaN.
    """
    return _load_fundamental_series_cached(symbol, start_date, end_date).copy(deep=True)


@lru_cache(maxsize=1024)
def _load_fundamental_series_cached(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    stock = _import_pykrx_stock()
    raw = stock.get_market_fundamental_by_date(
        to_pykrx_date(start_date),
        to_pykrx_date(end_date),
        symbol,
    )
    if raw is None or raw.empty:
        return pd.DataFrame(columns=list(FUND_COLUMNS))

    df = raw.copy()
    df.index = pd.to_datetime(df.index).strftime("%Y-%m-%d")
    df.index.name = "date"

    for col in FUND_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df[list(FUND_COLUMNS)]


def build_fundamental_panel_asof(
    universe: list[tuple[str, str]],
    calendar_dates: list[str],
    start_date: str,
    end_date: str,
    *,
    max_workers: int = 6,
) -> dict[str, pd.DataFrame]:
    """
    각 종목 투자지표를 가격 캘린더 `calendar_dates`에 재인덱스한 뒤 ffill.
    ffill은 '해당 거래일까지 공개된 마지막 스냅샷' 의미(미래 값 사용 안 함).
    pykrx 호출을 병렬로 묶어 대기 시간을 줄인다.
    """
    symbols = [s for s, _ in universe]
    panels: dict[str, pd.DataFrame] = {}
    idx = pd.Index(calendar_dates)

    def fetch(sym: str) -> tuple[str, pd.DataFrame]:
        return sym, load_fundamental_series(sym, start_date, end_date)

    raw_by_sym: dict[str, pd.DataFrame] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(fetch, sym) for sym in symbols]
        for fut in as_completed(futures):
            sym, raw = fut.result()
            raw_by_sym[sym] = raw

    for symbol in symbols:
        raw = raw_by_sym.get(symbol, pd.DataFrame())
        if raw.empty:
            panels[symbol] = pd.DataFrame(np.nan, index=idx, columns=list(FUND_COLUMNS))
            continue
        full_index = idx.union(raw.index, sort=True)
        aligned = raw.reindex(full_index).sort_index().ffill().reindex(idx)
        panels[symbol] = aligned

    return panels


def stack_metric_panel(panels: dict[str, pd.DataFrame], metric: str, symbols: list[str]) -> pd.DataFrame:
    """symbols 순서대로 metric 열만 모은 date x symbol 행렬."""
    cols = {}
    for sym in symbols:
        df = panels.get(sym)
        if df is None or metric not in df.columns:
            cols[sym] = pd.Series(np.nan, index=panels[symbols[0]].index if panels else [])
        else:
            cols[sym] = df[metric]
    return pd.DataFrame(cols)
