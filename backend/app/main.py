from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.backtest.engine import run_backtest
from app.data.ticker_loader import search_tickers
from app.schemas.backtest import BacktestRequest, BacktestResponse

app = FastAPI(title="Quantledge Backtest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4321",
        "http://127.0.0.1:4321",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/tickers/search")
def search_tickers_endpoint(q: str, market: str = "ALL", limit: int = 10) -> dict[str, object]:
    try:
        return {"items": search_tickers(q, market=market, limit=limit)}
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": True,
                "message": "종목 목록을 가져오지 못했습니다.",
                "detail": str(exc),
            },
        ) from exc


@app.post("/api/backtest/run", response_model=BacktestResponse)
def run_backtest_endpoint(request: BacktestRequest) -> BacktestResponse:
    try:
        result = run_backtest(request)
        return BacktestResponse(**result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": True,
                "message": "가격 데이터를 가져오지 못했거나 백테스트 계산에 실패했습니다.",
                "detail": str(exc),
            },
        ) from exc
