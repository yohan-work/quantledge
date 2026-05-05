import type { PriceData } from './types';

export const calculateMovingAverage = (
  data: PriceData[],
  period: number,
): Array<number | null> => {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error('Moving average period must be a positive integer.');
  }

  let rollingSum = 0;

  return data.map((point, index) => {
    rollingSum += point.close;

    if (index >= period) {
      rollingSum -= data[index - period].close;
    }

    if (index < period - 1) {
      return null;
    }

    return rollingSum / period;
  });
};
