from __future__ import annotations

import unittest
from unittest.mock import patch

import pandas as pd

from app.backtest.costs import parse_cost_model
from app.backtest.engine import run_backtest
from app.data.price_loader import PriceLoadResult, _finalize_price_frame
from app.schemas.backtest import BacktestRequest


class CostModelTests(unittest.TestCase):
    def test_parse_cost_model_uses_top_level_commission_and_parameter_rates(self) -> None:
        model = parse_cost_model(
            {"slippageRate": 0.001, "sellTaxRate": 0.002, "buyTaxRate": 0.0003},
            commission_rate=0.0007,
        )

        self.assertAlmostEqual(model.commission_rate, 0.0007)
        self.assertAlmostEqual(model.slippage_rate, 0.001)
        self.assertAlmostEqual(model.sell_tax_rate, 0.002)
        self.assertAlmostEqual(model.buy_tax_rate, 0.0003)


class PriceLoaderValidationTests(unittest.TestCase):
    def test_finalize_price_frame_rejects_non_positive_prices(self) -> None:
        frame = pd.DataFrame(
            {
                "open": [100.0],
                "high": [110.0],
                "low": [95.0],
                "close": [-1.0],
                "volume": [1000.0],
                "tradingValue": [100000.0],
            },
            index=pd.to_datetime(["2024-01-02"]),
        )

        with self.assertRaises(ValueError):
            _finalize_price_frame(frame)


class BacktestEngineTests(unittest.TestCase):
    def _single_result(self) -> dict:
        return {
            "strategyId": "ma",
            "strategyName": "20일 이동평균선 전략",
            "symbol": "005930",
            "symbolName": "삼성전자",
            "startDate": "2024-01-02",
            "endDate": "2024-01-03",
            "initialCapital": 1_000_000.0,
            "finalCapital": 1_000_000.0,
            "totalReturn": 0.0,
            "cagr": 0.0,
            "mdd": 0.0,
            "tradeCount": 0,
            "buyAndHold": {
                "finalCapital": 1_000_000.0,
                "totalReturn": 0.0,
                "cagr": 0.0,
                "mdd": 0.0,
            },
            "priceData": [],
            "equityCurve": [],
            "drawdownCurve": [],
            "signals": [],
        }

    def _portfolio_result(self) -> dict:
        return {
            "strategyId": "portfolio-rebalance",
            "strategyName": "유동성 + 12-1 모멘텀 월간 리밸런싱",
            "symbol": "UNIVERSE",
            "symbolName": "동일유니버스 3종",
            "startDate": "2024-01-02",
            "endDate": "2024-01-31",
            "initialCapital": 1_000_000.0,
            "finalCapital": 1_000_000.0,
            "totalReturn": 0.0,
            "cagr": 0.0,
            "mdd": 0.0,
            "tradeCount": 0,
            "buyAndHold": {
                "finalCapital": 1_000_000.0,
                "totalReturn": 0.0,
                "cagr": 0.0,
                "mdd": 0.0,
            },
            "portfolioStats": {
                "averageCashWeight": 0.1,
                "maxCashWeight": 0.2,
                "averageHoldingCount": 2.0,
                "minHoldingCount": 1,
                "maxHoldingCount": 3,
            },
            "priceData": [],
            "equityCurve": [],
            "drawdownCurve": [],
            "signals": [],
            "displayKind": "portfolio",
            "dataSource": "krx",
            "dataQuality": {
                "requestedStartDate": "2024-01-02",
                "requestedEndDate": "2024-01-31",
                "actualStartDate": "2024-01-02",
                "actualEndDate": "2024-01-31",
                "tradingDayCount": 20,
                "maWarmupDays": 20,
                "firstValidMaDate": "2024-01-31",
                "hasMissingOhlcv": False,
                "universeDescription": "KRX KOSPI 시가총액 상위 3개",
                "rebalanceMonths": 1,
                "strategyNote": "기존 전략 노트",
            },
        }

    def test_run_backtest_passes_cost_model_to_single_strategy(self) -> None:
        price_frame = pd.DataFrame(
            {
                "date": ["2024-01-02", "2024-01-03", "2024-01-04"],
                "open": [100.0, 101.0, 102.0],
                "high": [110.0, 111.0, 112.0],
                "low": [90.0, 91.0, 92.0],
                "close": [100.0, 101.0, 102.0],
                "volume": [1000.0, 1100.0, 1200.0],
                "tradingValue": [100000.0, 111100.0, 122400.0],
            }
        )
        request = BacktestRequest(
            strategyId="ma20",
            symbol="005930",
            symbolName="삼성전자",
            startDate="2024-01-02",
            endDate="2024-01-04",
            initialCapital=1_000_000,
            commissionRate=0.0007,
            parameters={"period": 20, "slippageRate": 0.001, "sellTaxRate": 0.002},
        )

        with patch("app.backtest.engine.load_price_data") as load_price_data_mock, patch(
            "app.backtest.engine.run_moving_average_backtest"
        ) as strategy_mock:
            load_price_data_mock.return_value = PriceLoadResult(source="krx", data=price_frame)
            strategy_mock.return_value = self._single_result()

            result = run_backtest(request)

        cost_model = strategy_mock.call_args.kwargs["cost_model"]
        self.assertAlmostEqual(cost_model.commission_rate, 0.0007)
        self.assertAlmostEqual(cost_model.slippage_rate, 0.001)
        self.assertAlmostEqual(cost_model.sell_tax_rate, 0.002)
        self.assertEqual(result["dataSource"], "krx")
        self.assertIn("거래비용 모델", result["dataQuality"]["strategyNote"])

    def test_run_backtest_aliases_universe_trading_value_and_costs_for_portfolio(self) -> None:
        request = BacktestRequest(
            strategyId="portfolio-rebalance",
            symbol="UNIVERSE",
            symbolName="유니버스 포트폴리오",
            startDate="2024-01-02",
            endDate="2024-01-31",
            initialCapital=1_000_000,
            commissionRate=0.0005,
            parameters={
                "topK": 3,
                "minUniverseTradingValue": 1_234_000_000,
                "rankingMode": "momentum",
                "slippageRate": 0.0008,
                "sellTaxRate": 0.001,
            },
        )

        with patch("app.backtest.engine.run_monthly_universe_factor_backtest") as strategy_mock:
            strategy_mock.return_value = self._portfolio_result()

            result = run_backtest(request)

        call_kwargs = strategy_mock.call_args.kwargs
        self.assertEqual(call_kwargs["min_avg_trading_value"], 1_234_000_000.0)
        cost_model = call_kwargs["cost_model"]
        self.assertAlmostEqual(cost_model.commission_rate, 0.0005)
        self.assertAlmostEqual(cost_model.slippage_rate, 0.0008)
        self.assertAlmostEqual(cost_model.sell_tax_rate, 0.001)
        self.assertEqual(result["strategyName"], "유니버스 월간 리밸런싱 (유동성·12-1 모멘텀)")
        self.assertIn("거래비용 모델", result["dataQuality"]["strategyNote"])


if __name__ == "__main__":
    unittest.main()
