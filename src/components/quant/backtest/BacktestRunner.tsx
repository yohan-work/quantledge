import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import DrawdownChart from './DrawdownChart';
import EquityCurveChart from './EquityCurveChart';
import PriceSignalChart from './PriceSignalChart';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/backtest/formatters';
import type { BacktestResult, BacktestRunRequest, StrategyDefinition, TradeSignal } from '@/lib/backtest/types';

const apiBaseUrl = import.meta.env.PUBLIC_BACKTEST_API_URL ?? 'http://localhost:8000';

type PeriodPreset = '1y' | '3y' | '5y' | '10y' | 'from2015' | 'custom';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addYears = (date: Date, years: number) => {
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
};

const today = toDateInputValue(new Date());

const periodPresets: Array<{ id: PeriodPreset; label: string }> = [
  { id: '1y', label: '1년' },
  { id: '3y', label: '3년' },
  { id: '5y', label: '5년' },
  { id: '10y', label: '10년' },
  { id: 'from2015', label: '2015년부터 검증' },
  { id: 'custom', label: '직접 입력' },
];

const resolvePresetDates = (preset: PeriodPreset, currentEndDate: string) => {
  const endDate = currentEndDate || today;
  if (preset === 'from2015') {
    return {
      startDate: '2015-01-01',
      endDate: today,
    };
  }
  if (preset === 'custom') {
    return null;
  }

  const years = {
    '1y': 1,
    '3y': 3,
    '5y': 5,
    '10y': 10,
  }[preset];

  return {
    startDate: toDateInputValue(addYears(new Date(endDate), -years)),
    endDate,
  };
};

type TickerSearchItem = {
  symbolName: string;
  symbol: string;
};

const suggestedTickers: TickerSearchItem[] = [
  { symbolName: '삼성전자', symbol: '005930' },
  { symbolName: 'SK하이닉스', symbol: '000660' },
  { symbolName: 'LG에너지솔루션', symbol: '373220' },
  { symbolName: '삼성바이오로직스', symbol: '207940' },
  { symbolName: '현대차', symbol: '005380' },
  { symbolName: '기아', symbol: '000270' },
  { symbolName: 'NAVER', symbol: '035420' },
  { symbolName: '카카오', symbol: '035720' },
  { symbolName: '셀트리온', symbol: '068270' },
  { symbolName: 'POSCO홀딩스', symbol: '005490' },
];

type BacktestStrategyDefinition = StrategyDefinition & {
  defaultPeriod: number;
  lockedPeriod: boolean;
};

const strategyDefinitions: BacktestStrategyDefinition[] = [
  {
    id: 'ma20',
    name: '20일 이동평균선 전략',
    description: '종가가 20일 이동평균선 위에 있을 때만 보유 상태로 전환하는 단기 추세 전략',
    category: 'technical',
    enabled: true,
    parameters: [{ key: 'period', label: '이동평균 기간', type: 'number', defaultValue: 20 }],
    defaultPeriod: 20,
    lockedPeriod: true,
  },
  {
    id: 'ma60',
    name: '60일 이동평균선 전략',
    description: '종가가 60일 이동평균선 위에 있을 때만 보유 상태로 전환하는 중기 추세 전략',
    category: 'technical',
    enabled: true,
    parameters: [{ key: 'period', label: '이동평균 기간', type: 'number', defaultValue: 60 }],
    defaultPeriod: 60,
    lockedPeriod: true,
  },
  {
    id: 'golden-cross',
    name: '20/60 골든크로스',
    description: '단기 이동평균선과 장기 이동평균선 교차를 비교하는 전략',
    category: 'technical',
    enabled: false,
    parameters: [],
    defaultPeriod: 20,
    lockedPeriod: false,
  },
  {
    id: 'low-per-quality',
    name: '저PER + 퀄리티',
    description: '밸류에이션과 수익성 조건을 함께 검토하는 팩터 전략',
    category: 'fundamental',
    enabled: false,
    parameters: [],
    defaultPeriod: 20,
    lockedPeriod: false,
  },
  {
    id: 'portfolio-rebalance',
    name: '월간 리밸런싱',
    description: '여러 종목을 정해진 주기로 재조정하는 포트폴리오 전략',
    category: 'portfolio',
    enabled: false,
    parameters: [],
    defaultPeriod: 20,
    lockedPeriod: false,
  },
];

const resolveBuyAndHold = (result: BacktestResult) => ({
  finalCapital: result.buyAndHold?.finalCapital ?? result.buyAndHoldFinalCapital ?? result.initialCapital,
  totalReturn: result.buyAndHold?.totalReturn ?? result.buyAndHoldTotalReturn ?? 0,
  cagr: result.buyAndHold?.cagr ?? result.buyAndHoldCagr ?? 0,
  mdd: result.buyAndHold?.mdd ?? result.buyAndHoldMdd ?? 0,
});

const sourceLabelMap: Record<string, string> = {
  krx: 'KRX',
  naver: 'pykrx Naver',
  fdr: 'FinanceDataReader',
};

const compactTradingValue = (value?: number) => {
  if (!value) return '-';
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value / 100000000)}억`;
};

const formatVolume = (value?: number) =>
  value ? `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)}주` : '-';

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    const detail = payload.detail?.detail ?? payload.detail ?? payload.message;
    if (typeof detail === 'string') return detail;
    if (payload.detail?.message) return payload.detail.message;
  } catch {
    return response.statusText;
  }
  return response.statusText;
};

const SignalRows = ({ signals }: { signals: TradeSignal[] }) => {
  const allSignals = signals;

  return (
    <section className="quant-section" aria-labelledby="signals-title">
      <div className="section-head compact">
        <div>
          <p className="eyebrow">Signals</p>
          <h2 id="signals-title">전체 신호 검증</h2>
        </div>
        <p className="data-range">{formatNumber(allSignals.length)}개 신호</p>
      </div>
      <div className="table-scroll signal-scroll">
        <table className="signal-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>종가</th>
              <th>이동평균선</th>
              <th>포지션</th>
              <th>액션</th>
              <th>이유</th>
            </tr>
          </thead>
          <tbody>
            {allSignals.map((signal) => (
              (() => {
                const movingAverage = signal.movingAverage ?? signal.ma20;
                return (
                  <tr key={signal.date}>
                    <td>{signal.date}</td>
                    <td>{formatCurrency(signal.close)}</td>
                    <td>{movingAverage === null ? '-' : formatCurrency(movingAverage)}</td>
                    <td>{signal.position === 1 ? '보유' : '현금'}</td>
                    <td>
                      <span className={`signal-badge ${signal.action.toLowerCase()}`}>{signal.action}</span>
                    </td>
                    <td>{signal.reason}</td>
                  </tr>
                );
              })()
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const DataQualityCard = ({ result }: { result: BacktestResult }) => {
  const quality = result.dataQuality;
  const firstPrice = result.priceData?.[0];
  const lastPrice = result.priceData?.[result.priceData.length - 1];

  if (!quality || !firstPrice || !lastPrice) return null;

  const sourceLabel = result.dataSource ? sourceLabelMap[result.dataSource] : '확인 불가';
  const requestedRangeChanged =
    quality.requestedStartDate !== quality.actualStartDate || quality.requestedEndDate !== quality.actualEndDate;

  return (
    <section className="quant-section" aria-labelledby="data-quality-title">
      <div className="section-head compact">
        <div>
          <p className="eyebrow">Data Check</p>
          <h2 id="data-quality-title">데이터 검증</h2>
        </div>
      </div>
      <div className="data-quality-grid">
        <article className="data-quality-card">
          <span>데이터 소스</span>
          <strong>{sourceLabel}</strong>
          <p>현재 백엔드가 실제로 사용한 가격 데이터 경로입니다.</p>
        </article>
        <article className="data-quality-card">
          <span>입력 시작일</span>
          <strong>{quality.requestedStartDate}</strong>
          <p>사용자가 요청한 백테스트 시작일입니다.</p>
        </article>
        <article className="data-quality-card">
          <span>실제 시작 거래일</span>
          <strong>{quality.actualStartDate}</strong>
          <p>{requestedRangeChanged ? '입력 범위 안에서 가장 가까운 실제 거래일로 보정했습니다.' : '입력 시작일이 실제 거래일입니다.'}</p>
        </article>
        <article className="data-quality-card">
          <span>입력 종료일</span>
          <strong>{quality.requestedEndDate}</strong>
          <p>사용자가 요청한 백테스트 종료일입니다.</p>
        </article>
        <article className="data-quality-card">
          <span>실제 종료 거래일</span>
          <strong>{quality.actualEndDate}</strong>
          <p>{requestedRangeChanged ? '주말과 휴장일은 제외하고 실제 거래일까지만 계산했습니다.' : '입력 종료일이 실제 거래일입니다.'}</p>
        </article>
        <article className="data-quality-card">
          <span>거래일 수</span>
          <strong>{formatNumber(quality.tradingDayCount)}일</strong>
          <p>주말과 국내 시장 휴장일은 데이터에서 제외되는 것이 정상입니다.</p>
        </article>
        <article className="data-quality-card">
          <span>이동평균 시작</span>
          <strong>{quality.firstValidMaDate ?? '-'}</strong>
          <p>초기 {formatNumber(quality.maWarmupDays)}거래일은 이동평균 계산 전이라 신호 검증 구간에서 제외됩니다.</p>
        </article>
        <article className="data-quality-card">
          <span>첫 거래일 샘플</span>
          <strong>{formatCurrency(firstPrice.close)}</strong>
          <p>
            {firstPrice.date} · 거래량 {formatVolume(firstPrice.volume)} · 거래대금 {compactTradingValue(firstPrice.tradingValue)}
          </p>
        </article>
        <article className="data-quality-card">
          <span>마지막 거래일 샘플</span>
          <strong>{formatCurrency(lastPrice.close)}</strong>
          <p>
            {lastPrice.date} · 거래량 {formatVolume(lastPrice.volume)} · 거래대금 {compactTradingValue(lastPrice.tradingValue)}
          </p>
        </article>
      </div>
      {quality.hasMissingOhlcv && (
        <p className="quality-warning">일부 OHLC 가격에 결측이 있습니다. 기간이나 데이터 소스를 다시 확인해야 합니다.</p>
      )}
    </section>
  );
};

export default function BacktestRunner() {
  const [form, setForm] = useState({
    strategyId: 'ma20',
    symbol: '',
    symbolName: '',
    startDate: toDateInputValue(addYears(new Date(), -3)),
    endDate: today,
    period: 20,
    initialCapital: 10000000,
    commissionRate: 0,
  });
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('3y');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickerMatches, setTickerMatches] = useState<TickerSearchItem[]>([]);
  const [isTickerLoading, setIsTickerLoading] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);

  const enabledStrategy = useMemo(
    () => strategyDefinitions.find((strategy) => strategy.id === form.strategyId),
    [form.strategyId],
  );

  const updateField = (field: keyof typeof form, value: string) => {
    const numericFields = new Set(['period', 'initialCapital', 'commissionRate']);
    setForm((current) => ({
      ...current,
      [field]: numericFields.has(field) ? Number(value) : value,
    }));
    if (field === 'startDate' || field === 'endDate') {
      setPeriodPreset('custom');
    }
  };

  const updateStrategy = (strategyId: string) => {
    const strategy = strategyDefinitions.find((item) => item.id === strategyId);
    setForm((current) => ({
      ...current,
      strategyId,
      period: strategy?.defaultPeriod ?? current.period,
    }));
  };

  useEffect(() => {
    const query = form.symbolName.trim();
    if (query.length < 2) {
      setTickerMatches([]);
      setTickerError(null);
      setIsTickerLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsTickerLoading(true);
      setTickerError(null);

      try {
        const response = await fetch(
          `${apiBaseUrl}/api/tickers/search?q=${encodeURIComponent(query)}&market=ALL&limit=8`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(await getErrorMessage(response));
        }

        const payload = (await response.json()) as { items: TickerSearchItem[] };
        setTickerMatches(payload.items);
        const exactMatch = payload.items.find((item) => item.symbolName === query);
        const uniqueMatch = payload.items.length === 1 ? payload.items[0] : null;
        const matchedTicker = exactMatch ?? uniqueMatch;
        if (matchedTicker) {
          setForm((current) => ({
            ...current,
            symbolName: matchedTicker.symbolName,
            symbol: matchedTicker.symbol,
          }));
        }
      } catch (exc) {
        if (!controller.signal.aborted) {
          setTickerMatches([]);
          setTickerError(exc instanceof Error ? exc.message : '종목 검색 중 오류가 발생했습니다.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsTickerLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [form.symbolName]);

  const updateSymbolName = (value: string) => {
    setForm((current) => ({
      ...current,
      symbolName: value,
      symbol: '',
    }));
  };

  const selectTicker = (symbolName: string, symbol: string) => {
    setForm((current) => ({
      ...current,
      symbolName,
      symbol,
    }));
  };

  const applyPeriodPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const dates = resolvePresetDates(preset, form.endDate);
    if (!dates) return;

    setForm((current) => ({
      ...current,
      startDate: dates.startDate,
      endDate: dates.endDate,
    }));
  };

  const runBacktest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.symbol.trim() || !form.symbolName.trim()) {
      setError('종목명과 종목코드를 입력해 주세요. 종목명을 입력하면 알려진 종목은 코드가 자동으로 채워집니다.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const request: BacktestRunRequest = {
      strategyId: form.strategyId,
      symbol: form.symbol,
      symbolName: form.symbolName,
      startDate: form.startDate,
      endDate: form.endDate,
      initialCapital: form.initialCapital,
      commissionRate: form.commissionRate,
      parameters: {
        period: form.period,
      },
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = (await response.json()) as BacktestResult;
      setResult(payload);
    } catch (exc) {
      setResult(null);
      setError(exc instanceof Error ? exc.message : '백테스트 실행 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const buyAndHold = result ? resolveBuyAndHold(result) : null;
  const summaryRows =
    result && buyAndHold
      ? [
          ['최종 자산', formatCurrency(result.finalCapital), formatCurrency(buyAndHold.finalCapital)],
          ['총수익률', formatPercent(result.totalReturn), formatPercent(buyAndHold.totalReturn)],
          ['CAGR', formatPercent(result.cagr), formatPercent(buyAndHold.cagr)],
          ['MDD', formatPercent(result.mdd), formatPercent(buyAndHold.mdd)],
          ['거래 횟수', `${formatNumber(result.tradeCount)}회`, '0회'],
          [
            '단순 보유 대비',
            formatPercent(result.finalCapital / buyAndHold.finalCapital - 1),
            '기준',
          ],
        ]
      : [];

  return (
    <>
      <section className="quant-grid two-col">
        <article className="quant-card">
          <p className="eyebrow">Strategy Selector</p>
          <h2>전략 선택</h2>
          <div className="strategy-list compact-list">
            {strategyDefinitions.map((strategy) => (
              <label
                key={strategy.id}
                className={`strategy-pill strategy-option ${strategy.enabled ? 'enabled' : 'disabled'}`}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={strategy.id}
                  checked={form.strategyId === strategy.id}
                  disabled={!strategy.enabled}
                  onChange={(event) => updateStrategy(event.target.value)}
                />
                <span>{strategy.name}</span>
                {!strategy.enabled && <small>준비 중</small>}
              </label>
            ))}
          </div>
          {enabledStrategy && <p className="form-help">{enabledStrategy.description}</p>}
        </article>

        <form className="quant-card backtest-form" onSubmit={runBacktest}>
          <p className="eyebrow">Backtest Conditions</p>
          <h2>조건 입력</h2>
          <div className="form-grid">
            <label>
              <span>종목명</span>
              <input
                value={form.symbolName}
                list="ticker-options"
                placeholder="예: 삼성전자"
                onChange={(event) => updateSymbolName(event.target.value)}
              />
              <datalist id="ticker-options">
                {tickerMatches.map((ticker) => (
                  <option key={ticker.symbol} value={ticker.symbolName}>
                    {ticker.symbol}
                  </option>
                ))}
              </datalist>
            </label>
            <label>
              <span>종목코드</span>
              <input
                value={form.symbol}
                placeholder="예: 005930"
                onChange={(event) => updateField('symbol', event.target.value)}
              />
            </label>
            <label>
              <span>시작일</span>
              <input type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} />
            </label>
            <label>
              <span>종료일</span>
              <input type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} />
            </label>
            <label>
              <span>이동평균 기간</span>
              <input
                type="number"
                min="2"
                max="240"
                value={form.period}
                disabled={enabledStrategy?.lockedPeriod}
                onChange={(event) => updateField('period', event.target.value)}
              />
            </label>
            <label>
              <span>초기 자산</span>
              <input
                type="number"
                min="100000"
                step="100000"
                value={form.initialCapital}
                onChange={(event) => updateField('initialCapital', event.target.value)}
              />
            </label>
            <label>
              <span>거래비용</span>
              <input
                type="number"
                min="0"
                max="0.05"
                step="0.001"
                value={form.commissionRate}
                onChange={(event) => updateField('commissionRate', event.target.value)}
              />
            </label>
          </div>
          <button className="run-button" type="submit" disabled={isLoading}>
            {isLoading ? '계산 중' : '백테스트 실행'}
          </button>
          <p className="form-help">
            종목명을 2글자 이상 입력하면 KRX 종목 목록에서 코드를 찾습니다. 후보가 여러 개면 아래에서 선택하세요.
          </p>
          <div className="period-presets" aria-label="백테스트 기간 빠른 선택">
            {periodPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={periodPreset === preset.id ? 'active' : ''}
                onClick={() => applyPeriodPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="form-help">
            기간 버튼은 입력값만 바꿉니다. 주말과 휴장일은 백엔드에서 실제 거래일 기준으로 보정해 표시합니다.
          </p>
          {(isTickerLoading || tickerError || tickerMatches.length > 0) && (
            <div className="ticker-search-panel" aria-live="polite">
              {isTickerLoading && <span>종목을 검색 중입니다.</span>}
              {tickerError && <span className="ticker-error">{tickerError}</span>}
              {!isTickerLoading &&
                tickerMatches.map((ticker) => (
                  <button
                    key={ticker.symbol}
                    type="button"
                    onClick={() => selectTicker(ticker.symbolName, ticker.symbol)}
                  >
                    <strong>{ticker.symbolName}</strong>
                    <span>{ticker.symbol}</span>
                  </button>
                ))}
            </div>
          )}
          <div className="ticker-shortcuts" aria-label="종목 빠른 선택">
            {suggestedTickers.slice(0, 6).map((ticker) => (
              <button
                key={ticker.symbol}
                type="button"
                onClick={() => selectTicker(ticker.symbolName, ticker.symbol)}
              >
                {ticker.symbolName}
              </button>
            ))}
          </div>
        </form>
      </section>

      {isLoading && (
        <section className="state-card loading-state" aria-live="polite">
          실제 가격 데이터를 불러오고 백테스트를 계산 중입니다.
        </section>
      )}

      {error && (
        <section className="state-card error-state" aria-live="polite">
          <strong>해당 기간의 가격 데이터를 가져오지 못했습니다.</strong>
          <span>{error}</span>
          <span>종목코드, 기간, 백엔드 실행 상태, 데이터 소스를 확인해 주세요.</span>
        </section>
      )}

      {!result && !isLoading && !error && (
        <section className="state-card">
          조건을 확인한 뒤 백테스트 실행 버튼을 눌러 실제 거래일 가격 데이터 기반 결과를 확인합니다.
        </section>
      )}

      {result && buyAndHold && (
        <>
          <DataQualityCard result={result} />

          <section className="quant-section" aria-labelledby="summary-title">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Result Summary</p>
                <h2 id="summary-title">결과 요약</h2>
              </div>
              <p className="data-range">
                {result.startDate} - {result.endDate} · {formatNumber(result.priceData?.length ?? 0)} 거래일
              </p>
            </div>
            <div className="metric-grid">
              {summaryRows.map(([label, strategy, benchmark]) => (
                <article className="metric-card" key={label}>
                  <span>{label}</span>
                  <strong>{strategy}</strong>
                  <p>단순 보유: {benchmark}</p>
                </article>
              ))}
            </div>
          </section>

          {result.priceData && (
            <section className="quant-section" aria-labelledby="price-title">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Price Signals</p>
                  <h2 id="price-title">가격 캔들 · 이동평균선 · 신호 검증</h2>
                </div>
              </div>
              <PriceSignalChart priceData={result.priceData} signals={result.signals} />
              <div className="chart-reading-notes">
                <span>1. 캔들로 실제 가격의 시가·고가·저가·종가를 확인합니다.</span>
                <span>2. 5/20/60/120선으로 단기·중기 흐름을 같이 봅니다.</span>
                <span>3. 굵은 파란선은 현재 선택한 전략이 쓰는 기준선입니다.</span>
                <span>4. 하단 거래량 막대로 시장 관심이 커진 날을 확인합니다.</span>
              </div>
            </section>
          )}

          <section className="quant-section" aria-labelledby="equity-title">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Equity Curve</p>
                <h2 id="equity-title">자산 곡선</h2>
              </div>
            </div>
            <EquityCurveChart data={result.equityCurve} />
          </section>

          <section className="quant-section" aria-labelledby="drawdown-title">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Drawdown</p>
                <h2 id="drawdown-title">Drawdown 그래프</h2>
              </div>
            </div>
            <DrawdownChart data={result.drawdownCurve} />
          </section>

          <SignalRows signals={result.signals} />
        </>
      )}
    </>
  );
}
