from __future__ import annotations

from functools import lru_cache
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from importlib import import_module
from io import StringIO
import os
import tempfile
from typing import Literal

import pandas as pd

from app import config as _config  # noqa: F401
from app.utils.date_utils import to_pykrx_date

_matplotlib_cache = os.path.join(tempfile.gettempdir(), "quantledge-matplotlib")
os.makedirs(_matplotlib_cache, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", _matplotlib_cache)


UniverseMarket = Literal["KOSPI", "KOSDAQ", "ALL"]


def _import_pykrx_stock():
    with redirect_stdout(StringIO()):
        return import_module("pykrx.stock")


def _reference_dates(reference_date: str) -> list[str]:
    dt = datetime.strptime(reference_date, "%Y-%m-%d")
    offsets = [0, 1, 2, 3, 4, 7, 10, 14, 21, 30]
    return [(dt - timedelta(days=offset)).strftime("%Y-%m-%d") for offset in offsets]


def _normalize_cap_frame(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return raw

    df = raw.copy()
    df.index = df.index.astype(str)
    return df.rename(
        columns={
            "시가총액": "marketCap",
            "거래대금": "tradingValue",
            "거래량": "volume",
            "상장주식수": "shares",
            "종가": "close",
        }
    )


def load_krx_market_cap_universe(
    *,
    reference_date: str,
    market: UniverseMarket = "KOSPI",
    top_n: int = 30,
    min_trading_value: float = 5_000_000_000.0,
) -> tuple[list[tuple[str, str]], str]:
    """KRX 시가총액 상위 유니버스.

    reference_date 또는 그 직전 거래 가능일의 KRX 스냅샷만 사용한다.
    백테스트 종료일 기준으로 뽑지 않으므로 시작 시점 이후의 미래 정보를 쓰지 않는다.
    """
    if top_n < 1:
        raise ValueError("universeSize는 1 이상이어야 합니다.")
    if market not in ("KOSPI", "KOSDAQ", "ALL"):
        raise ValueError("universeMarket은 KOSPI, KOSDAQ, ALL 중 하나여야 합니다.")

    tickers, label = _load_krx_market_cap_universe_cached(
        reference_date=reference_date,
        market=market,
        top_n=top_n,
        min_trading_value=min_trading_value,
    )
    return list(tickers), label


@lru_cache(maxsize=64)
def _load_krx_market_cap_universe_cached(
    *,
    reference_date: str,
    market: UniverseMarket,
    top_n: int,
    min_trading_value: float,
) -> tuple[list[tuple[str, str]], str]:
    stock = _import_pykrx_stock()
    last_error: Exception | None = None

    for candidate in _reference_dates(reference_date):
        try:
            raw = stock.get_market_cap_by_ticker(to_pykrx_date(candidate), market=market)
            df = _normalize_cap_frame(raw)
            if df.empty or "marketCap" not in df.columns:
                continue

            if "tradingValue" in df.columns:
                df = df[df["tradingValue"].fillna(0) >= min_trading_value]

            df = df[df["marketCap"].fillna(0) > 0].sort_values("marketCap", ascending=False)
            if df.empty:
                continue

            tickers: list[tuple[str, str]] = []
            for symbol in df.index.tolist():
                name = stock.get_market_ticker_name(symbol)
                if name:
                    tickers.append((symbol, name))
                if len(tickers) >= top_n:
                    break

            if tickers:
                label = (
                    f"KRX {market} 시가총액 상위 {len(tickers)}개 "
                    f"(기준일 {candidate}, 거래대금 {min_trading_value:,.0f}원 이상)"
                )
                return tickers, label
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"KRX 유니버스를 가져오지 못했습니다. Last error: {last_error}")
