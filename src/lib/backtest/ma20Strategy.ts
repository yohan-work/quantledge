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

const TRADING_DAYS_PER_YEAR = 252;

const calculateAnnualizedVolatility = (returns: number[]) => {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
};

const calculateSharpeRatio = (returns: number[]) => {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const std = calculateAnnualizedVolatility(returns) / Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR);
};

const calculateWinRate = (returns: number[]) => {
  if (returns.length === 0) return 0;
  return returns.filter((value) => value > 0).length / returns.length;
};

const calculateMaxConsecutiveLossDays = (returns: number[]) => {
  let maxRun = 0;
  let currentRun = 0;
  returns.forEach((value) => {
    if (value < 0) {
      currentRun += 1;
      maxRun = Math.max(maxRun, currentRun);
      return;
    }
    currentRun = 0;
  });
  return maxRun;
};

const calculateRecoveryDays = (equityCurve: number[]) => {
  if (equityCurve.length === 0) return null;

  let peak = equityCurve[0];
  let peakIndex = 0;
  let troughIndex = 0;
  let minDrawdown = 0;

  equityCurve.forEach((value, index) => {
    if (value > peak) {
      peak = value;
      peakIndex = index;
    }

    const drawdown = value / peak - 1;
    if (drawdown < minDrawdown) {
      minDrawdown = drawdown;
      troughIndex = index;
    }
  });

  for (let index = troughIndex + 1; index < equityCurve.length; index += 1) {
    if (equityCurve[index] >= peak) {
      return index - peakIndex;
    }
  }

  return null;
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
  const strategyReturns = equityCurve.map((point, index) =>
    index === 0 ? 0 : point.strategyEquity / equityCurve[index - 1].strategyEquity - 1,
  );
  const buyAndHoldReturns = equityCurve.map((point, index) =>
    index === 0 ? 0 : point.buyAndHoldEquity / equityCurve[index - 1].buyAndHoldEquity - 1,
  );
  const strategyEquityValues = equityCurve.map((point) => point.strategyEquity);
  const buyAndHoldEquityValues = equityCurve.map((point) => point.buyAndHoldEquity);
  const strategyPerformance = {
    annualizedVolatility: calculateAnnualizedVolatility(strategyReturns),
    sharpeRatio: calculateSharpeRatio(strategyReturns),
    winRate: calculateWinRate(strategyReturns),
    maxConsecutiveLossDays: calculateMaxConsecutiveLossDays(strategyReturns),
    recoveryDays: calculateRecoveryDays(strategyEquityValues),
  };
  const buyAndHoldPerformance = {
    annualizedVolatility: calculateAnnualizedVolatility(buyAndHoldReturns),
    sharpeRatio: calculateSharpeRatio(buyAndHoldReturns),
    winRate: calculateWinRate(buyAndHoldReturns),
    maxConsecutiveLossDays: calculateMaxConsecutiveLossDays(buyAndHoldReturns),
    recoveryDays: calculateRecoveryDays(buyAndHoldEquityValues),
  };

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
    ...strategyPerformance,
    tradeCount,
    buyAndHold: {
      finalCapital: buyAndHoldFinalCapital,
      totalReturn: buyAndHoldFinalCapital / initialCapital - 1,
      cagr: calculateCAGR(initialCapital, buyAndHoldFinalCapital, startDate, endDate),
      mdd: calculateMDD(drawdownCurve, 'buyAndHoldDrawdown'),
      ...buyAndHoldPerformance,
    },
    equityCurve,
    drawdownCurve,
    signals,
  };
};
