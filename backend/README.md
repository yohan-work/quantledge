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

The service is for learning and backtest experiments only. It is not an investment recommendation system.
