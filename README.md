# Quantledge

Quantledge is a personal quant portfolio lab for learning stock and quant basics, testing strategy ideas, and turning backtest results into practical portfolio allocations.

The project keeps structured study notes, but the main product direction is the backtest and portfolio workflow: learn the minimum concepts needed, test strategy candidates, compare risk and return, then design a portfolio that can be used for real investing decisions.

## Purpose

This project focuses on helping a beginner move from terminology to practical portfolio construction.

The content starts from basic stock market terminology and gradually expands into quantitative investing topics such as factor-based strategies, portfolio construction, rebalancing, and backtesting. The goal is not to master every strategy first, but to understand enough to run practical backtests and judge whether a strategy is usable.

## Content Structure

The site separates the learning material into two main categories.

- Stock: basic market concepts, trading terms, price terms, chart concepts, financial indicators, and performance terminology.
- Quant: quantitative investing concepts, strategy design, factor selection, data requirements, backtesting foundations, and portfolio construction.

Each chapter is written as a Markdown document under the `docs` directory. The site turns those documents into readable pages with navigation, table of contents, and search support.

## Key Features

- Chapter-based archive for stock and quant study notes
- Separate navigation for stock and quantitative investing materials
- Search across concepts and document sections
- Section-level navigation with active table of contents highlighting
- Simple reading-focused interface inspired by clean technical writing sites
- Quant Backtest Lab at `/quant/backtest/` with a FastAPI backend for real price data backtests
- Portfolio Lab at `/quant/portfolio/` for turning candidate strategies into target allocations and investment amounts

## Quant Backtest Lab

The backtest lab is a practical verification tool. It is not an investment recommendation service, and past performance does not guarantee future returns.

Current implementation:

- Astro frontend for strategy inputs, loading/error states, result cards, charts, and signal tables
- FastAPI backend under `backend/`
- `pykrx` as the primary Korean stock data loader
- `finance-datareader` fallback when the primary loader fails
- pandas moving-average backtest with next-trading-day position shift
- configurable trading cost model with commission, slippage, and optional sell-side tax inputs

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

Default backtest:

- Strategy: moving-average strategy
- Symbol: Samsung Electronics `005930`
- Initial period: user-selected, default 20 trading days
- API endpoint: `POST /api/backtest/run`

## Portfolio Lab

The portfolio lab is a first practical bridge from backtest results to real allocation planning.

Current implementation:

- Input total capital, target MDD, minimum cash weight, and risk profile
- Select candidate strategies such as Regime MA, Golden Cross, Low PER + Quality, TQQQ + Cash Rebalancing, and Value Rebalancing
- Calculate draft weights, investment amounts, estimated portfolio CAGR, estimated MDD, and a pre-investment checklist

The current Portfolio Lab uses placeholder strategy metrics for planning. A later version should connect directly to saved backtest results.

## Design Direction

The interface is intentionally minimal and content-first.

The visual system uses a restrained palette based on white, black, gray, and a single blue accent color. The goal is to keep the learning flow clear and reduce visual noise while making dense financial concepts easier to scan and revisit.

## Project Scope

Quantledge is not intended to provide investment advice, trading recommendations, or automated order execution.

It is a personal learning and portfolio construction environment for building enough understanding to run backtests and design a portfolio that still requires the user's final judgment.
