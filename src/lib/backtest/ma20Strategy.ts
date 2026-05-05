import { calculateMovingAverage } from './indicators';
import { calculateCAGR, calculateDrawdown, calculateMDD } from './metrics';
import type { BacktestResult, PriceData, PriceDataWithMA, TradeSignal } from './types';

type RunMA20BacktestParams = {
  data: PriceData[];
  period: number;
  initialCapital: number;
  commissionRate: number;
};

const getAction = (previousPosition: 0 | 1, position: 0 | 1): TradeSignal['action'] => {
  if (previousPosition === 0 && position === 1) return 'BUY';
  if (previousPosition === 1 && position === 0) return 'SELL';
  if (position === 1) return 'HOLD';
  return 'CASH';
};

const getReason = (action: TradeSignal['action'], ma20: number | null) => {
  if (ma20 === null) return '20일 이동평균선 계산 전이라 거래하지 않습니다.';
  if (action === 'BUY') return '전 거래일 종가가 20일선 위로 올라와 오늘부터 보유 상태로 전환됩니다.';
  if (action === 'SELL') return '전 거래일 종가가 20일선 아래로 내려가 오늘부터 현금 상태로 전환됩니다.';
  if (action === 'HOLD') return '전 거래일 신호가 보유 조건을 유지합니다.';
  return '전 거래일 신호가 현금 대기 조건을 유지합니다.';
};

export const generateMA20Signals = (dataWithMA: PriceDataWithMA[]): TradeSignal[] => {
  const rawSignals = dataWithMA.map((point): 0 | 1 => {
    if (point.ma20 === null) return 0;
    return point.close > point.ma20 ? 1 : 0;
  });

  return dataWithMA.map((point, index) => {
    const previousPosition: 0 | 1 = index <= 1 ? 0 : rawSignals[index - 2];
    const position: 0 | 1 = index === 0 ? 0 : rawSignals[index - 1];
    const action = getAction(previousPosition, position);

    return {
      date: point.date,
      action,
      close: point.close,
      ma20: point.ma20,
      position,
      reason: getReason(action, index === 0 ? null : dataWithMA[index - 1].ma20),
    };
  });
};

export const runMA20Backtest = ({
  data,
  period,
  initialCapital,
  commissionRate,
}: RunMA20BacktestParams): BacktestResult => {
  if (data.length < period + 2) {
    throw new Error('Backtest data must include enough rows to calculate signals and shifted returns.');
  }

  const movingAverage = calculateMovingAverage(data, period);
  const dataWithMA: PriceDataWithMA[] = data.map((point, index) => ({
    ...point,
    ma20: movingAverage[index],
  }));
  const signals = generateMA20Signals(dataWithMA);

  let strategyEquity = initialCapital;
  let buyAndHoldEquity = initialCapital;
  const equityCurve = data.map((point, index) => {
    if (index > 0) {
      const dailyReturn = point.close / data[index - 1].close - 1;
      const position = signals[index].position;
      const tradedToday = signals[index].action === 'BUY' || signals[index].action === 'SELL';
      const commissionDrag = tradedToday ? commissionRate : 0;

      strategyEquity *= 1 + dailyReturn * position - commissionDrag;
      buyAndHoldEquity *= 1 + dailyReturn;
    }

    return {
      date: point.date,
      strategyEquity,
      buyAndHoldEquity,
    };
  });

  const drawdownCurve = calculateDrawdown(equityCurve);
  const finalCapital = equityCurve[equityCurve.length - 1].strategyEquity;
  const buyAndHoldFinalCapital = equityCurve[equityCurve.length - 1].buyAndHoldEquity;
  const tradeCount = signals.filter((signal) => signal.action === 'BUY' || signal.action === 'SELL').length;
  const startDate = data[0].date;
  const endDate = data[data.length - 1].date;

  return {
    strategyName: `${period}일 이동평균선 전략`,
    symbol: '005930',
    symbolName: '삼성전자',
    startDate,
    endDate,
    initialCapital,
    finalCapital,
    buyAndHoldFinalCapital,
    totalReturn: finalCapital / initialCapital - 1,
    buyAndHoldTotalReturn: buyAndHoldFinalCapital / initialCapital - 1,
    excessReturn: finalCapital / buyAndHoldFinalCapital - 1,
    cagr: calculateCAGR(initialCapital, finalCapital, startDate, endDate),
    buyAndHoldCagr: calculateCAGR(initialCapital, buyAndHoldFinalCapital, startDate, endDate),
    mdd: calculateMDD(drawdownCurve),
    buyAndHoldMdd: calculateMDD(drawdownCurve, 'buyAndHoldDrawdown'),
    tradeCount,
    equityCurve,
    drawdownCurve,
    signals,
  };
};
