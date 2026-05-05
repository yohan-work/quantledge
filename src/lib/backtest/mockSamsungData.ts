import type { PriceData } from './types';

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const roundToTick = (value: number) => Math.round(value / 100) * 100;

const createMockSamsungPriceData = (): PriceData[] => {
  const data: PriceData[] = [];
  const date = new Date('2023-01-02T00:00:00.000Z');
  let close = 59000;
  let tradingDay = 0;

  while (data.length < 280) {
    if (!isWeekday(date)) {
      date.setUTCDate(date.getUTCDate() + 1);
      continue;
    }

    const cycle = Math.sin(tradingDay / 14) * 0.012 + Math.cos(tradingDay / 39) * 0.008;
    const trend = tradingDay < 85 ? 0.0007 : tradingDay < 160 ? -0.00045 : 0.00055;
    const eventDip = tradingDay > 120 && tradingDay < 145 ? -0.004 : 0;
    const eventRecovery = tradingDay > 190 && tradingDay < 218 ? 0.0032 : 0;
    const dailyMove = trend + cycle + eventDip + eventRecovery;
    const nextClose = Math.max(48000, roundToTick(close * (1 + dailyMove)));
    const open = roundToTick(close * (1 + Math.sin(tradingDay / 9) * 0.004));
    const high = roundToTick(Math.max(open, nextClose) * (1.008 + Math.abs(Math.sin(tradingDay / 11)) * 0.005));
    const low = roundToTick(Math.min(open, nextClose) * (0.992 - Math.abs(Math.cos(tradingDay / 10)) * 0.004));
    const volume = Math.round(9200000 + Math.abs(Math.sin(tradingDay / 17)) * 6800000 + (tradingDay % 23) * 90000);

    data.push({
      date: toIsoDate(date),
      open,
      high,
      low,
      close: nextClose,
      volume,
      tradingValue: nextClose * volume,
    });

    close = nextClose;
    tradingDay += 1;
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return data;
};

export const mockSamsungPriceData: PriceData[] = createMockSamsungPriceData();
