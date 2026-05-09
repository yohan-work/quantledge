import { useMemo, useState } from 'react';

type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

type StrategyCandidate = {
  id: string;
  name: string;
  role: string;
  kind: 'trend' | 'rebalancing' | 'factor' | 'cash';
  cagr: number;
  mdd: number;
  rebalance: string;
  note: string;
};

const strategyCandidates: StrategyCandidate[] = [
  {
    id: 'regime-ma',
    name: '레짐 MA',
    role: '큰 하락장 회피',
    kind: 'trend',
    cagr: 0.16,
    mdd: -0.18,
    rebalance: '일별 신호 확인',
    note: '장기 추세가 나쁠 때 현금으로 빠지는 방어형 추세 전략',
  },
  {
    id: 'golden-cross',
    name: '20/60 골든크로스',
    role: '중기 추세 참여',
    kind: 'trend',
    cagr: 0.13,
    mdd: -0.24,
    rebalance: '일별 신호 확인',
    note: '단기선이 장기선 위에 있을 때만 보유하는 기본 추세 전략',
  },
  {
    id: 'low-per-quality',
    name: '저PER + 퀄리티',
    role: '종목 분산과 가치 팩터',
    kind: 'factor',
    cagr: 0.14,
    mdd: -0.28,
    rebalance: '월 1회',
    note: '저평가와 이익 품질 조건으로 종목을 고르는 팩터 포트폴리오',
  },
  {
    id: 'tqqq-cash',
    name: 'TQQQ + 현금 리밸런싱',
    role: '공격적 성장',
    kind: 'rebalancing',
    cagr: 0.25,
    mdd: -0.45,
    rebalance: '주 1회',
    note: '레버리지 ETF를 현금과 섞어 공격성과 생존성을 함께 관리하는 후보',
  },
  {
    id: 'value-rebalance',
    name: '밸류 리밸런싱',
    role: '하락 시 자동 매수',
    kind: 'rebalancing',
    cagr: 0.11,
    mdd: -0.20,
    rebalance: '월 1회',
    note: '목표 비중에서 벗어나면 다시 맞추며 비싸질 때 줄이고 싸질 때 늘리는 구조',
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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function PortfolioBuilder() {
  const [totalCapital, setTotalCapital] = useState(10_000_000);
  const [targetMdd, setTargetMdd] = useState(0.25);
  const [minCash, setMinCash] = useState(0.1);
  const [profile, setProfile] = useState<RiskProfile>('balanced');
  const [selectedIds, setSelectedIds] = useState<string[]>(['regime-ma', 'low-per-quality', 'tqqq-cash']);

  const selectedStrategies = useMemo(
    () => strategyCandidates.filter((strategy) => selectedIds.includes(strategy.id)),
    [selectedIds],
  );

  const allocation = useMemo(() => {
    if (selectedStrategies.length === 0) return [];

    const availableWeight = 1 - minCash;
    const config = profileConfig[profile];
    const rawScores = selectedStrategies.map((strategy) => {
      const riskPenalty = Math.max(Math.abs(strategy.mdd), 0.01);
      const returnScore = Math.max(strategy.cagr, 0.01) ** config.growthTilt;
      const riskFit = clamp(targetMdd / riskPenalty, 0.25, 1.4);
      return returnScore * riskFit;
    });
    const scoreSum = rawScores.reduce((sum, score) => sum + score, 0) || 1;

    let rows = selectedStrategies.map((strategy, index) => ({
      strategy,
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
        cagr: row.strategy.cagr,
        mdd: row.strategy.mdd,
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
      },
    ];
  }, [minCash, profile, selectedStrategies, targetMdd, totalCapital]);

  const portfolioCagr = allocation.reduce((sum, row) => sum + row.weight * row.cagr, 0);
  const portfolioMdd = allocation.reduce((sum, row) => sum + row.weight * row.mdd, 0);
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
          <p className="form-help">
            v1은 실제 최적화 엔진이 아니라, 백테스트 결과를 보고 실전 투자 비중을 설계하는 수동 구성기입니다.
            CAGR/MDD 값은 후보 전략을 비교하기 위한 예시값이며, 이후 백테스트 결과와 연결해 교체합니다.
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
              <strong>{formatCurrency(worstLossAmount)}</strong>
              과거 기준 최대 손실액
            </span>
            <span>
              <strong>{profileConfig[profile].label}</strong>
              투자 성향
            </span>
          </div>
          <p className={mddFits ? 'portfolio-status good' : 'portfolio-status warn'}>
            {mddFits
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
          <p className="data-range">{selectedStrategies.length}개 선택</p>
        </div>
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
              <small>
                CAGR {formatPercent(strategy.cagr)} · MDD {formatPercent(strategy.mdd)} · {strategy.rebalance}
              </small>
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
                  <td>{formatPercent(row.weight)}</td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td>{row.rebalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
