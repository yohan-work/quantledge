import type { DrawdownPoint, EquityPoint } from './types';

const dayMs = 24 * 60 * 60 * 1000;

export const calculateCAGR = (
  initialCapital: number,
  finalCapital: number,
  startDate: string,
  endDate: string,
): number => {
  const elapsedDays = Math.max(
    1,
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / dayMs,
  );
  const years = elapsedDays / 365;

  return (finalCapital / initialCapital) ** (1 / years) - 1;
};

export const calculateDrawdown = (equityCurve: EquityPoint[]): DrawdownPoint[] => {
  let strategyPeak = 0;
  let buyAndHoldPeak = 0;

  return equityCurve.map((point) => {
    strategyPeak = Math.max(strategyPeak, point.strategyEquity);
    buyAndHoldPeak = Math.max(buyAndHoldPeak, point.buyAndHoldEquity);

    return {
      date: point.date,
      strategyDrawdown: point.strategyEquity / strategyPeak - 1,
      buyAndHoldDrawdown: point.buyAndHoldEquity / buyAndHoldPeak - 1,
    };
  });
};

export const calculateMDD = (
  drawdownCurve: DrawdownPoint[],
  key: 'strategyDrawdown' | 'buyAndHoldDrawdown' = 'strategyDrawdown',
): number => Math.min(...drawdownCurve.map((point) => point[key]));
