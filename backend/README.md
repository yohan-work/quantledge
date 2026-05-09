# Quantledge Backtest Backend

FastAPI backend for the Quant Backtest Lab. It loads Korean stock OHLCV data with `pykrx`, runs a pandas-based moving-average backtest, and returns JSON for the Astro frontend.

## Run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Data Source

Set `BACKTEST_PRICE_SOURCE` to control price loading.

```bash
export BACKTEST_PRICE_SOURCE=auto
```

Supported values:

- `auto`: recommended. Uses KRX when `KRX_ID` and `KRX_PW` exist, otherwise uses pykrx's adjusted Naver daily path, then FinanceDataReader.
- `krx`: forces the pykrx KRX path. Requires `KRX_ID` and `KRX_PW`.
- `naver`: forces pykrx's adjusted daily OHLCV path.
- `fdr`: forces FinanceDataReader.

For KRX:

```bash
cp .env.example .env
# edit .env and fill KRX_ID/KRX_PW
```

Or export variables directly:

```bash
export BACKTEST_PRICE_SOURCE=krx
export KRX_ID="your_krx_id"
export KRX_PW="your_krx_password"
uvicorn app.main:app --reload --port 8000
```

Do not commit real KRX credentials. `backend/.env` is ignored by git and loaded at backend startup.

Frontend environment:

```bash
PUBLIC_BACKTEST_API_URL=http://localhost:8000
```

Then run the Astro app:

```bash
npm install
npm run dev
```

## API

`POST /api/backtest/run`

```json
{
  "strategyId": "ma",
  "symbol": "005930",
  "symbolName": "삼성전자",
  "startDate": "2023-01-01",
  "endDate": "2024-01-31",
  "initialCapital": 10000000,
  "commissionRate": 0,
  "parameters": {
    "period": 20
  }
}
```

`low-per-quality` / `portfolio-rebalance` additionally accept:

- `topK`: number of holdings
- `rankingMode`: `momentum` (12-1 price momentum) or `value_quality` (pykrx PER/PBR/EPS/BPS with lag)
- `fundamentalLagDays`: trading-day lag for the fundamental snapshot when using `value_quality` (default 20)
- `universeMarket`: `KOSPI`, `KOSDAQ`, or `ALL` (default `KOSPI`)
- `universeSize`: number of KRX market-cap ranked candidates to load at the requested start date (default 30)
- `minUniverseTradingValue`: minimum KRX reference-date trading value for the initial universe (default 5,000,000,000 KRW)
- `useMarketTrendFilter`: when true, holds cash unless the selected market index is above its moving average
- `marketTrendIndex`: `KOSPI` or `KOSDAQ` for the market filter (default `KOSPI`)
- `marketTrendPeriod`: moving-average period for the market filter (default 200)
- `useIndividualTrendFilter`: when true, only ranks/holds candidates above their own moving average
- `individualTrendPeriod`: moving-average period for individual candidates (default 120)

Portfolio strategies no longer use a hard-coded sample universe. The backend builds the universe from KRX market-cap data at the requested start date or the nearest prior trading day, then applies the factor and rebalancing rules to that universe.

The service is for personal backtest and portfolio construction support only. It is not an investment recommendation system.
