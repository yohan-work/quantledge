# Quantledge

Quantledge is a learning archive for studying stock market fundamentals and quantitative investing concepts.

The project is designed as a structured reference site for organizing personal study notes, definitions, strategy ideas, and backtesting concepts. Its main purpose is to make stock and quant investing terminology easier to review, search, and connect while building a stronger foundation for data-driven investing.

## Purpose

This archive focuses on understanding investment concepts deeply before applying them in practice.

The content starts from basic stock market terminology and gradually expands into quantitative investing topics such as factor-based strategies, portfolio construction, rebalancing, and backtesting.

## Content Structure

The site separates the learning material into two main categories.

- Stock: basic market concepts, trading terms, price terms, chart concepts, financial indicators, and performance terminology.
- Quant: quantitative investing concepts, strategy design, factor selection, data requirements, and backtesting foundations.

Each chapter is written as a Markdown document under the `docs` directory. The site turns those documents into readable pages with navigation, table of contents, and search support.

## Key Features

- Chapter-based archive for stock and quant study notes
- Separate navigation for stock and quantitative investing materials
- Search across concepts and document sections
- Section-level navigation with active table of contents highlighting
- Simple reading-focused interface inspired by clean technical writing sites
- Quant Backtest Lab at `/quant/backtest/` with a FastAPI backend for real price data experiments

## Quant Backtest Lab

The backtest lab is a learning and experiment tool. It is not an investment recommendation service, and past performance does not guarantee future returns.

Current implementation:

- Astro frontend for strategy inputs, loading/error states, result cards, charts, and signal tables
- FastAPI backend under `backend/`
- `pykrx` as the primary Korean stock data loader
- `finance-datareader` fallback when the primary loader fails
- pandas moving-average backtest with next-trading-day position shift

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export BACKTEST_PRICE_SOURCE=auto
uvicorn app.main:app --reload --port 8000
```

Use `BACKTEST_PRICE_SOURCE=krx` with `KRX_ID` and `KRX_PW` when the backend should force KRX data. Without those credentials, `auto` skips the KRX path and falls back to pykrx's adjusted daily data path and FinanceDataReader. Local credentials can be placed in `backend/.env`; that file is ignored by git.

Frontend:

```bash
PUBLIC_BACKTEST_API_URL=http://localhost:8000 npm run dev
```

Default experiment:

- Strategy: moving-average strategy
- Symbol: Samsung Electronics `005930`
- Initial period: user-selected, default 20 trading days
- API endpoint: `POST /api/backtest/run`

## Design Direction

The interface is intentionally minimal and content-first.

The visual system uses a restrained palette based on white, black, gray, and a single blue accent color. The goal is to keep the learning flow clear and reduce visual noise while making dense financial concepts easier to scan and revisit.

## Project Scope

Quantledge is not intended to provide investment advice or trading recommendations.

It is a personal educational archive for organizing concepts, improving understanding, and preparing for future quantitative investing experiments.
