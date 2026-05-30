from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


def _coerce_rate(value: Any, field_name: str, *, max_rate: float = 0.1) -> float:
    rate = float(value)
    if rate < 0:
        raise ValueError(f"{field_name}는 0 이상이어야 합니다.")
    if rate > max_rate:
        raise ValueError(f"{field_name}는 {max_rate * 100:.1f}% 이하여야 합니다.")
    return rate


@dataclass(frozen=True)
class CostModel:
    commission_rate: float = 0.0
    slippage_rate: float = 0.0
    sell_tax_rate: float = 0.0
    buy_tax_rate: float = 0.0

    @property
    def round_trip_rate(self) -> float:
        return self.commission_rate + self.slippage_rate


def parse_cost_model(
    params: Mapping[str, Any],
    *,
    commission_rate: float | None = None,
) -> CostModel:
    return CostModel(
        commission_rate=_coerce_rate(
            params.get("commissionRate", commission_rate if commission_rate is not None else 0.0),
            "commissionRate",
        ),
        slippage_rate=_coerce_rate(
            params.get("slippageRate", params.get("slippage_rate", 0.0)),
            "slippageRate",
        ),
        sell_tax_rate=_coerce_rate(
            params.get("sellTaxRate", params.get("sell_tax_rate", 0.0)),
            "sellTaxRate",
        ),
        buy_tax_rate=_coerce_rate(
            params.get("buyTaxRate", params.get("buy_tax_rate", 0.0)),
            "buyTaxRate",
        ),
    )
