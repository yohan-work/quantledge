import os
import tempfile
from contextlib import redirect_stdout
from dataclasses import dataclass
from importlib import import_module
from io import StringIO

import pandas as pd

from app import config as _config  # noqa: F401
from app.utils.date_utils import to_pykrx_date

_matplotlib_cache = os.path.join(tempfile.gettempdir(), "quantledge-matplotlib")
os.makedirs(_matplotlib_cache, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", _matplotlib_cache)


NORMALIZED_COLUMNS = ["open", "high", "low", "close", "volume", "tradingValue"]
PRICE_SOURCE_ENV = "BACKTEST_PRICE_SOURCE"
SUPPORTED_PRICE_SOURCES = {"auto", "krx", "naver", "fdr"}


@dataclass(frozen=True)
class PriceLoadResult:
    source: str
    data: pd.DataFrame


def _has_krx_credentials() -> bool:
    return bool(os.getenv("KRX_ID") and os.getenv("KRX_PW"))


def _import_pykrx_stock():
    # Some pykrx versions print KRX login status during import. Keep API logs clean
    # and surface credential problems through explicit exceptions below.
    with redirect_stdout(StringIO()):
        return import_module("pykrx.stock")


def _finalize_price_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise ValueError("price data source returned empty data")

    df = df.copy()
    df.index = pd.to_datetime(df.index)
    df = df.sort_index()
    df = df.dropna(subset=["open", "high", "low", "close"])
    df = df.reset_index(names="date")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    for column in NORMALIZED_COLUMNS:
        if column not in df.columns:
            df[column] = 0

    if (df["tradingValue"] == 0).all() and "close" in df.columns and "volume" in df.columns:
        df["tradingValue"] = df["close"] * df["volume"]

    return df[["date", *NORMALIZED_COLUMNS]]


def _normalize_pykrx_frame(raw: pd.DataFrame, source_name: str) -> pd.DataFrame:
    if raw.empty:
        raise ValueError(f"{source_name} returned empty OHLCV data")

    df = raw.rename(
        columns={
            "시가": "open",
            "고가": "high",
            "저가": "low",
            "종가": "close",
            "거래량": "volume",
            "거래대금": "tradingValue",
        }
    )

    return _finalize_price_frame(df)


def load_price_data_from_pykrx_naver(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    stock = _import_pykrx_stock()

    raw = stock.get_market_ohlcv_by_date(
        to_pykrx_date(start_date),
        to_pykrx_date(end_date),
        symbol,
        adjusted=True,
    )

    return _normalize_pykrx_frame(raw, "pykrx naver")


def load_price_data_from_pykrx_krx(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    if not _has_krx_credentials():
        raise RuntimeError("KRX_ID and KRX_PW environment variables are required for BACKTEST_PRICE_SOURCE=krx.")

    stock = _import_pykrx_stock()

    raw = stock.get_market_ohlcv_by_date(
        to_pykrx_date(start_date),
        to_pykrx_date(end_date),
        symbol,
        adjusted=True,
    )

    return _normalize_pykrx_frame(raw, "pykrx krx")


def load_price_data_from_fdr(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    import FinanceDataReader as fdr

    raw = fdr.DataReader(symbol, start_date, end_date)

    if raw.empty:
        raise ValueError("FinanceDataReader returned empty OHLCV data")

    df = raw.rename(
        columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        }
    )
    if "tradingValue" not in df.columns:
        df["tradingValue"] = df["close"] * df["volume"]

    return _finalize_price_frame(df)


def _source_sequence() -> list[str]:
    source = os.getenv(PRICE_SOURCE_ENV, "auto").strip().lower()
    if source not in SUPPORTED_PRICE_SOURCES:
        raise ValueError(
            f"{PRICE_SOURCE_ENV} must be one of {sorted(SUPPORTED_PRICE_SOURCES)}. Current value: {source}"
        )

    if source != "auto":
        return [source]

    if _has_krx_credentials():
        return ["krx", "naver", "fdr"]

    return ["naver", "fdr"]


def load_price_data(symbol: str, start_date: str, end_date: str) -> PriceLoadResult:
    errors: list[str] = []
    loaders = {
        "krx": load_price_data_from_pykrx_krx,
        "naver": load_price_data_from_pykrx_naver,
        "fdr": load_price_data_from_fdr,
    }

    for source in _source_sequence():
        try:
            return PriceLoadResult(source=source, data=loaders[source](symbol, start_date, end_date))
        except Exception as exc:
            errors.append(f"{source}: {exc}")

    raise RuntimeError("All price data sources failed. " + " | ".join(errors))


INDEX_SYMBOLS = {
    "KOSPI": "1001",
    "KOSDAQ": "2001",
}


def load_index_price_data(index: str, start_date: str, end_date: str) -> PriceLoadResult:
    stock = _import_pykrx_stock()
    index_code = INDEX_SYMBOLS.get(index.upper(), INDEX_SYMBOLS["KOSPI"])
    raw = stock.get_index_ohlcv_by_date(
        to_pykrx_date(start_date),
        to_pykrx_date(end_date),
        index_code,
    )
    return PriceLoadResult(source="krx", data=_normalize_pykrx_frame(raw, f"pykrx index {index_code}"))
