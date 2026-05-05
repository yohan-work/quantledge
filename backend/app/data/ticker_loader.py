from functools import lru_cache
from datetime import date, timedelta

from app import config as _config  # noqa: F401


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def _ticker_reference_dates() -> list[str]:
    today = date.today()
    dates = []
    for offset in [0, 1, 2, 3, 7, 14, 30, 60, 120, 240, 365, 730]:
        dates.append((today - timedelta(days=offset)).strftime("%Y%m%d"))
    # Stable fallback for environments whose clock is ahead of available KRX data.
    dates.append("20240503")
    return dates


@lru_cache(maxsize=8)
def load_ticker_directory(market: str = "ALL") -> tuple[dict[str, str], ...]:
    from pykrx import stock

    symbols = []
    last_error: Exception | None = None
    for reference_date in _ticker_reference_dates():
        try:
            symbols = stock.get_market_ticker_list(date=reference_date, market=market)
            if symbols:
                break
        except Exception as exc:
            last_error = exc

    if not symbols:
        raise RuntimeError(f"KRX ticker list is empty. Last error: {last_error}")

    tickers = []
    for symbol in symbols:
        name = stock.get_market_ticker_name(symbol)
        if name:
            tickers.append({"symbol": symbol, "symbolName": name})

    return tuple(tickers)


def search_tickers(query: str, market: str = "ALL", limit: int = 10) -> list[dict[str, str]]:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return []

    ranked_matches: list[tuple[int, dict[str, str]]] = []
    for ticker in load_ticker_directory(market):
        symbol = ticker["symbol"]
        symbol_name = ticker["symbolName"]
        normalized_name = symbol_name.lower()
        if normalized_query == symbol.lower() or normalized_query == normalized_name:
            ranked_matches.append((0, ticker))
        elif normalized_name.startswith(normalized_query) or symbol.lower().startswith(normalized_query):
            ranked_matches.append((1, ticker))
        elif normalized_query in normalized_name or normalized_query in symbol.lower():
            ranked_matches.append((2, ticker))

    ranked_matches.sort(key=lambda item: (item[0], item[1]["symbolName"], item[1]["symbol"]))
    return [ticker for _, ticker in ranked_matches[:limit]]
