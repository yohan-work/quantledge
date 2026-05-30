import { useEffect, useMemo, useState } from 'react';
import type { BacktestResult, BacktestRunRequest } from '@/lib/backtest/types';

type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

type StrategyCandidate = {
  id: string;
  name: string;
  role: string;
  kind: 'trend' | 'factor';
  rebalance: string;
  note: string;
  buildRequest: (window: BacktestWindow) => BacktestRunRequest;
};

type BacktestWindow = {
  startDate: string;
  endDate: string;
  commissionRate: number;
  slippageRate: number;
  sellTaxRate: number;
};

const apiBaseUrl = import.meta.env.PUBLIC_BACKTEST_API_URL ?? 'http://localhost:8000';

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
const defaultBacktestStartDate = toDateInputValue(addYears(new Date(), -3));

const strategyCandidates: StrategyCandidate[] = [
  {
    id: 'ma20',
    name: '20일 이동평균선',
    role: '단기 추세 참여',
    kind: 'trend',
    rebalance: '일별 신호 확인',
    note: '종가가 20일 이동평균선 위에 있을 때만 보유하는 단기 추세 전략',
    buildRequest: (window) => ({
      strategyId: 'ma20',
      symbol: '005930',
      symbolName: '삼성전자',
      startDate: window.startDate,
      endDate: window.endDate,
      initialCapital: 10_000_000,
      commissionRate: window.commissionRate,
      parameters: {
        period: 20,
        slippageRate: window.slippageRate,
        sellTaxRate: window.sellTaxRate,
      },
    }),
  },
  {
    id: 'ma60',
    name: '60일 이동평균선',
    role: '중기 추세 참여',
    kind: 'trend',
    rebalance: '일별 신호 확인',
    note: '종가가 60일 이동평균선 위에 있을 때만 보유하는 중기 추세 전략',
    buildRequest: (window) => ({
      strategyId: 'ma60',
      symbol: '005930',
      symbolName: '삼성전자',
      startDate: window.startDate,
      endDate: window.endDate,
      initialCapital: 10_000_000,
      commissionRate: window.commissionRate,
      parameters: {
        period: 60,
        slippageRate: window.slippageRate,
        sellTaxRate: window.sellTaxRate,
      },
    }),
  },
  {
    id: 'golden-cross',
    name: '20/60 골든크로스',
    role: '중기 추세 참여',
    kind: 'trend',
    rebalance: '일별 신호 확인',
    note: '단기선이 장기선 위일 때만 보유하는 대표 추세 전략',
    buildRequest: (window) => ({
      strategyId: 'golden-cross',
      symbol: '005930',
      symbolName: '삼성전자',
      startDate: window.startDate,
      endDate: window.endDate,
      initialCapital: 10_000_000,
      commissionRate: window.commissionRate,
      parameters: {
        shortPeriod: 20,
        longPeriod: 60,
        slippageRate: window.slippageRate,
        sellTaxRate: window.sellTaxRate,
      },
    }),
  },
  {
    id: 'regime-ma',
    name: '레짐 MA',
    role: '큰 하락장 회피',
    kind: 'trend',
    rebalance: '일별 신호 확인',
    note: '장기 추세가 나쁠 때 현금으로 빠지는 방어형 추세 전략',
    buildRequest: (window) => ({
      strategyId: 'regime-ma',
      symbol: '005930',
      symbolName: '삼성전자',
      startDate: window.startDate,
      endDate: window.endDate,
      initialCapital: 10_000_000,
      commissionRate: window.commissionRate,
      parameters: {
        filterPeriod: 200,
        signalPeriod: 20,
        slippageRate: window.slippageRate,
        sellTaxRate: window.sellTaxRate,
      },
    }),
  },
  {
    id: 'low-per-quality',
    name: '저PER + 퀄리티',
    role: '종목 분산과 가치 팩터',
    kind: 'factor',
    rebalance: '월 1회',
    note: '백테스트 시작일 기준 KRX 유니버스를 뽑아 저PER·퀄리티 필터로 선별하는 팩터 전략',
    buildRequest: (window) => ({
      strategyId: 'low-per-quality',
      symbol: 'UNIVERSE',
      symbolName: '유니버스 포트폴리오',
      startDate: window.startDate,
      endDate: window.endDate,
      initialCapital: 10_000_000,
      commissionRate: window.commissionRate,
      parameters: {
        topK: 5,
        rankingMode: 'value_quality',
        fundamentalLagDays: 20,
        universeMarket: 'KOSPI',
        universeSize: 30,
        minUniverseTradingValue: 5_000_000_000,
        minAvgTradingValue: 5_000_000_000,
        useMarketTrendFilter: false,
        marketTrendIndex: 'KOSPI',
        marketTrendPeriod: 200,
        useIndividualTrendFilter: false,
        individualTrendPeriod: 120,
        slippageRate: window.slippageRate,
        sellTaxRate: window.sellTaxRate,
      },
    }),
  },
];

const profileConfig: Record<RiskProfile, { label: string; maxStrategyWeight: number; growthTilt: number }> = {
  conservative: { label: '보수', maxStrategyWeight: 0.35, growthTilt: 0.45 },
  balanced: { label: '중립', maxStrategyWeight: 0.45, growthTilt: 0.7 },
  aggressive: { label: '공격', maxStrategyWeight: 0.6, growthTilt: 1 },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);

const formatPercent = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value);

const formatDays = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : `${formatNumber(value)}일`;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

export default function PortfolioBuilder() {
  const [totalCapital, setTotalCapital] = useState(10_000_000);
  const [targetMdd, setTargetMdd] = useState(0.25);
  const [minCash, setMinCash] = useState(0.1);
  const [profile, setProfile] = useState<RiskProfile>('balanced');
  const [selectedIds, setSelectedIds] = useState<string[]>(['regime-ma', 'low-per-quality', 'golden-cross']);
  const [backtestWindow, setBacktestWindow] = useState<BacktestWindow>({
    startDate: defaultBacktestStartDate,
    endDate: today,
    commissionRate: 0,
    slippageRate: 0,
    sellTaxRate: 0,
  });
  const [candidateResults, setCandidateResults] = useState<Record<string, BacktestResult>>({});
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 240_000);

    const run = async () => {
      setIsLoadingResults(true);
      setBacktestError(null);

      try {
        const settled = await Promise.allSettled(
          strategyCandidates.map(async (candidate) => {
            const request = candidate.buildRequest(backtestWindow);
            const response = await fetch(`${apiBaseUrl}/api/backtest/run`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request),
              signal: controller.signal,
            });

            if (!response.ok) {
              throw new Error(await getErrorMessage(response));
            }

            return (await response.json()) as BacktestResult;
          }),
        );

        if (controller.signal.aborted) {
          return;
        }

        const nextResults: Record<string, BacktestResult> = {};
        const failures: string[] = [];
        settled.forEach((entry, index) => {
          const candidate = strategyCandidates[index];
          if (entry.status === 'fulfilled') {
            nextResults[candidate.id] = entry.value;
          } else {
            failures.push(candidate.name);
          }
        });

        setCandidateResults(nextResults);
        setBacktestError(
          failures.length > 0
            ? `일부 전략 백테스트에 실패했습니다: ${failures.join(', ')}`
            : null,
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setBacktestError(error instanceof Error ? error.message : '백테스트 결과를 불러오지 못했습니다.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingResults(false);
        }
      }
    };

    run();

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    backtestWindow.commissionRate,
    backtestWindow.endDate,
    backtestWindow.sellTaxRate,
    backtestWindow.slippageRate,
    backtestWindow.startDate,
  ]);

  const selectedStrategies = useMemo(
    () =>
      strategyCandidates
        .filter((strategy) => selectedIds.includes(strategy.id))
        .map((strategy) => ({
          strategy,
          result: candidateResults[strategy.id],
        }))
        .filter((entry): entry is { strategy: StrategyCandidate; result: BacktestResult } =>
          Boolean(entry.result),
        ),
    [candidateResults, selectedIds],
  );

  const allSelectedReady = selectedIds.every((id) => Boolean(candidateResults[id]));

  const allocation = useMemo(() => {
    if (selectedStrategies.length === 0 || !allSelectedReady) return [];

    const availableWeight = 1 - minCash;
    const config = profileConfig[profile];
    const rawScores = selectedStrategies.map(({ result }) => {
      const riskPenalty = Math.max(Math.abs(result.mdd), 0.01);
      const returnScore = Math.max(result.cagr, 0.01) ** config.growthTilt;
      const riskFit = clamp(targetMdd / riskPenalty, 0.25, 1.4);
      return returnScore * riskFit;
    });
    const scoreSum = rawScores.reduce((sum, score) => sum + score, 0) || 1;

    let rows = selectedStrategies.map(({ strategy, result }, index) => ({
      strategy,
      result,
      weight: Math.min((rawScores[index] / scoreSum) * availableWeight, config.maxStrategyWeight),
    }));

    const cappedSum = rows.reduce((sum, row) => sum + row.weight, 0);
    if (cappedSum > 0 && cappedSum < availableWeight) {
      const scale = availableWeight / cappedSum;
      rows = rows.map((row) => ({
        ...row,
        weight: Math.min(row.weight * scale, config.maxStrategyWeight),
      }));
    }

    const investedWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    const cashWeight = Math.max(1 - investedWeight, minCash);

    return [
      ...rows.map((row) => ({
        id: row.strategy.id,
        name: row.strategy.name,
        role: row.strategy.role,
        rebalance: row.strategy.rebalance,
        weight: row.weight,
        amount: Math.round(totalCapital * row.weight),
        cagr: row.result.cagr,
        mdd: row.result.mdd,
        sharpeRatio: row.result.sharpeRatio,
        winRate: row.result.winRate,
      })),
      {
        id: 'cash',
        name: '현금',
        role: '심리 안정과 추가 매수 여력',
        rebalance: '항상 유지',
        weight: cashWeight,
        amount: Math.round(totalCapital * cashWeight),
        cagr: 0,
        mdd: 0,
        sharpeRatio: 0,
        winRate: 0,
      },
    ];
  }, [allSelectedReady, minCash, profile, selectedStrategies, targetMdd, totalCapital]);

  const portfolioCagr = allocation.reduce((sum, row) => sum + row.weight * row.cagr, 0);
  const portfolioMdd = allocation.reduce((sum, row) => sum + row.weight * row.mdd, 0);
  const portfolioSharpe = allocation.reduce((sum, row) => sum + row.weight * (row.sharpeRatio ?? 0), 0);
  const worstLossAmount = Math.round(totalCapital * Math.abs(portfolioMdd));
  const mddFits = Math.abs(portfolioMdd) <= targetMdd;

  const toggleStrategy = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <>
      <section className="quant-grid two-col portfolio-input-grid">
        <article className="quant-card portfolio-form">
          <p className="eyebrow">Investment Conditions</p>
          <h2>투자 조건</h2>
          <div className="form-grid">
            <label>
              <span>총 투자금</span>
              <input
                type="number"
                min="100000"
                step="100000"
                value={totalCapital}
                onChange={(event) => setTotalCapital(Number(event.target.value))}
              />
            </label>
            <label>
              <span>목표 최대 MDD</span>
              <input
                type="number"
                min="5"
                max="80"
                step="1"
                value={Math.round(targetMdd * 100)}
                onChange={(event) => setTargetMdd(Number(event.target.value) / 100)}
              />
            </label>
            <label>
              <span>최소 현금 비중</span>
              <input
                type="number"
                min="0"
                max="80"
                step="1"
                value={Math.round(minCash * 100)}
                onChange={(event) => setMinCash(Number(event.target.value) / 100)}
              />
            </label>
            <label>
              <span>투자 성향</span>
              <select value={profile} onChange={(event) => setProfile(event.target.value as RiskProfile)}>
                <option value="conservative">보수</option>
                <option value="balanced">중립</option>
                <option value="aggressive">공격</option>
              </select>
            </label>
          </div>
          <div className="form-grid portfolio-backtest-grid">
            <label>
              <span>백테스트 시작일</span>
              <input
                type="date"
                value={backtestWindow.startDate}
                onChange={(event) =>
                  setBacktestWindow((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>백테스트 종료일</span>
              <input
                type="date"
                value={backtestWindow.endDate}
                onChange={(event) =>
                  setBacktestWindow((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>거래비용</span>
              <input
                type="number"
                min="0"
                max="0.05"
                step="0.001"
                value={backtestWindow.commissionRate}
                onChange={(event) =>
                  setBacktestWindow((current) => ({
                    ...current,
                    commissionRate: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>슬리피지</span>
              <input
                type="number"
                min="0"
                max="0.05"
                step="0.001"
                value={backtestWindow.slippageRate}
                onChange={(event) =>
                  setBacktestWindow((current) => ({
                    ...current,
                    slippageRate: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>매도세금</span>
              <input
                type="number"
                min="0"
                max="0.05"
                step="0.001"
                value={backtestWindow.sellTaxRate}
                onChange={(event) =>
                  setBacktestWindow((current) => ({
                    ...current,
                    sellTaxRate: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
          <p className="form-help">
            아래 백테스트 기간과 비용을 기준으로 각 후보 전략을 다시 계산합니다. 후보 카드와 비중 계산은 실제 결과를
            사용합니다.
          </p>
        </article>

        <article className="quant-card">
          <p className="eyebrow">Risk Summary</p>
          <h2>포트폴리오 요약</h2>
          <div className="portfolio-summary-grid">
            <span>
              <strong>{formatPercent(portfolioCagr)}</strong>
              예상 CAGR
            </span>
            <span className={mddFits ? 'good' : 'warn'}>
              <strong>{formatPercent(portfolioMdd)}</strong>
              예상 MDD
            </span>
            <span>
              <strong>{portfolioSharpe.toFixed(2)}</strong>
              가중 Sharpe
            </span>
            <span>
              <strong>{formatCurrency(worstLossAmount)}</strong>
              과거 기준 최대 손실액
            </span>
            <span>
              <strong>{profileConfig[profile].label}</strong>
              투자 성향
            </span>
          </div>
          <p className={mddFits ? 'portfolio-status good' : 'portfolio-status warn'}>
            {!allSelectedReady
              ? '선택한 전략들의 실제 백테스트 결과를 불러오는 중입니다.'
              : mddFits
                ? '현재 조합은 입력한 목표 MDD 안에 들어옵니다.'
                : '현재 조합은 목표 MDD를 넘습니다. 현금 비중을 늘리거나 공격 전략 비중을 줄여야 합니다.'}
          </p>
        </article>
      </section>

      <section className="quant-section" aria-labelledby="candidate-title">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Strategy Candidates</p>
            <h2 id="candidate-title">후보 전략 선택</h2>
          </div>
          <p className="data-range">
            {selectedIds.length}개 선택
            {isLoadingResults ? ' · 실제 백테스트 계산 중' : ' · 실제 백테스트 반영 완료'}
          </p>
        </div>
        {backtestError && <p className="quality-warning">{backtestError}</p>}
        <div className="portfolio-strategy-grid">
          {strategyCandidates.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              className={selectedIds.includes(strategy.id) ? 'selected' : ''}
              onClick={() => toggleStrategy(strategy.id)}
            >
              <span>{strategy.role}</span>
              <strong>{strategy.name}</strong>
              <p>{strategy.note}</p>
              {candidateResults[strategy.id] ? (
                <>
                  <small>
                    실제 CAGR {formatPercent(candidateResults[strategy.id].cagr)} · MDD {formatPercent(candidateResults[strategy.id].mdd)} · Sharpe {candidateResults[strategy.id].sharpeRatio.toFixed(2)}
                  </small>
                  <small>
                    승률 {formatPercent(candidateResults[strategy.id].winRate)} · 회복 {formatDays(candidateResults[strategy.id].recoveryDays)}
                  </small>
                  <small>
                    {candidateResults[strategy.id].dataSource?.toUpperCase() ?? 'API'} · {candidateResults[strategy.id].startDate} ~ {candidateResults[strategy.id].endDate}
                  </small>
                </>
              ) : (
                <small>{isLoadingResults ? '실제 백테스트 계산 중...' : '백테스트 결과를 불러올 수 없습니다.'}</small>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="quant-section" aria-labelledby="allocation-title">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Allocation</p>
            <h2 id="allocation-title">실전 투자 금액표</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>전략</th>
                <th>역할</th>
                <th>실제 성과</th>
                <th>비중</th>
                <th>투자 금액</th>
                <th>리밸런싱</th>
              </tr>
            </thead>
            <tbody>
              {allocation.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.role}</td>
                  <td>
                    CAGR {formatPercent(row.cagr)} · MDD {formatPercent(row.mdd)} · Sharpe {row.sharpeRatio.toFixed(2)}
                  </td>
                  <td>{formatPercent(row.weight)}</td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td>{row.rebalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!allSelectedReady && (
          <p className="form-help">
            선택한 전략들의 실제 백테스트 결과를 아직 모두 받지 못했습니다. 후보 카드가 채워지면 비중표도 자동으로
            갱신됩니다.
          </p>
        )}
      </section>

      <section className="quant-section" aria-labelledby="checklist-title">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Execution Checklist</p>
            <h2 id="checklist-title">실제 투자 전 체크리스트</h2>
          </div>
        </div>
        <div className="execution-checklist">
          <label>
            <input type="checkbox" />
            각 전략의 백테스트 기간과 데이터 소스를 확인했다.
          </label>
          <label>
            <input type="checkbox" />
            목표 MDD만큼 손실이 나도 전략을 유지할 수 있는지 생각했다.
          </label>
          <label>
            <input type="checkbox" />
            세금, 수수료, 환율, 슬리피지를 별도로 고려했다.
          </label>
          <label>
            <input type="checkbox" />
            리밸런싱 날짜와 실제 주문 방식을 정했다.
          </label>
          <label>
            <input type="checkbox" />
            이 결과가 투자 추천이 아니라 개인 실험 결과임을 이해했다.
          </label>
        </div>
      </section>
    </>
  );
}
