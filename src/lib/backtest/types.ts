export type PriceData = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradingValue?: number;
};

export type PriceDataWithMA = PriceData & {
  movingAverage?: number | null;
  ma5?: number | null;
  ma20: number | null;
  ma60?: number | null;
  ma120?: number | null;
};

export type EquityPoint = {
  date: string;
  strategyEquity: number;
  buyAndHoldEquity: number;
};

export type DrawdownPoint = {
  date: string;
  strategyDrawdown: number;
  buyAndHoldDrawdown: number;
};

export type TradeSignal = {
  date: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'CASH';
  close: number;
  movingAverage?: number | null;
  ma20?: number | null;
  position: 0 | 1;
  reason: string;
};

export type BacktestResult = {
  strategyId?: string;
  strategyName: string;
  symbol: string;
  symbolName: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  buyAndHoldFinalCapital?: number;
  totalReturn: number;
  buyAndHoldTotalReturn?: number;
  excessReturn?: number;
  cagr: number;
  buyAndHoldCagr?: number;
  mdd: number;
  buyAndHoldMdd?: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  winRate: number;
  maxConsecutiveLossDays: number;
  recoveryDays: number | null;
  tradeCount: number;
  buyAndHold?: {
    finalCapital: number;
    totalReturn: number;
    cagr: number;
    mdd: number;
    annualizedVolatility: number;
    sharpeRatio: number;
    winRate: number;
    maxConsecutiveLossDays: number;
    recoveryDays: number | null;
  };
  validation?: {
    enabled: boolean;
    splitRatio: number;
    splitDate: string;
    inSample: {
      startDate: string;
      endDate: string;
      finalCapital: number;
      totalReturn: number;
      cagr: number;
      mdd: number;
      annualizedVolatility: number;
      sharpeRatio: number;
      winRate: number;
      maxConsecutiveLossDays: number;
      recoveryDays: number | null;
      tradeCount: number;
    };
    outOfSample: {
      startDate: string;
      endDate: string;
      finalCapital: number;
      totalReturn: number;
      cagr: number;
      mdd: number;
      annualizedVolatility: number;
      sharpeRatio: number;
      winRate: number;
      maxConsecutiveLossDays: number;
      recoveryDays: number | null;
      tradeCount: number;
    };
    note?: string | null;
  } | null;
  portfolioStats?: {
    averageCashWeight: number;
    maxCashWeight: number;
    averageHoldingCount: number;
    minHoldingCount: number;
    maxHoldingCount: number;
  } | null;
  dataSource?: 'krx' | 'naver' | 'fdr';
  displayKind?: 'single' | 'portfolio';
  dataQuality?: {
    requestedStartDate: string;
    requestedEndDate: string;
    actualStartDate: string;
    actualEndDate: string;
    tradingDayCount: number;
    maWarmupDays: number;
    firstValidMaDate: string | null;
    hasMissingOhlcv: boolean;
    universeDescription?: string | null;
    rebalanceMonths?: number | null;
    strategyNote?: string | null;
  };
  priceData?: PriceDataWithMA[];
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
  signals: TradeSignal[];
};

export type StrategyParameter = {
  key: string;
  label: string;
  type: 'number' | 'text' | 'date';
  defaultValue: number | string;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  description: string;
  category: 'technical' | 'fundamental' | 'portfolio';
  enabled: boolean;
  parameters: StrategyParameter[];
};

export type BacktestRunRequest = {
  strategyId: string;
  symbol: string;
  symbolName: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  commissionRate: number;
  parameters: Record<string, number | string | boolean>;
};
