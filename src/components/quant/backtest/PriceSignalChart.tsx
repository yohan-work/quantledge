import {
  CartesianGrid,
  ComposedChart,
  Line,
  Bar,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import type { PriceDataWithMA, TradeSignal } from '@/lib/backtest/types';

type Props = {
  priceData: PriceDataWithMA[];
  signals: TradeSignal[];
};

const priceFormatter = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value);

const maLegend = [
  { key: 'ma5', label: '5', color: '#22c55e' },
  { key: 'ma20', label: '20', color: '#ef4444' },
  { key: 'ma60', label: '60', color: '#f59e0b' },
  { key: 'ma120', label: '120', color: '#8b5cf6' },
];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: ChartPoint;
};

type PriceTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadItem[];
};

function PriceTooltip({ active, label, payload }: PriceTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload.find((item) => item.payload)?.payload;
  if (!point) return null;

  const volume = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(point.volume);
  const tradingValue = point.tradingValue
    ? `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(point.tradingValue / 100000000)}억`
    : '-';

  return (
    <div className="chart-tooltip">
      <strong>날짜 {label}</strong>
      <span>시가 : {priceFormatter(point.open)}원</span>
      <span>고가 : {priceFormatter(point.high)}원</span>
      <span>저가 : {priceFormatter(point.low)}원</span>
      <span>종가 : {priceFormatter(point.close)}원</span>
      <span>거래량 : {volume}주</span>
      <span>거래대금 : {tradingValue}</span>
      {isFiniteNumber(point.movingAverage ?? point.ma20) && (
        <span style={{ color: '#1769ff' }}>
          전략 기준선 : {priceFormatter((point.movingAverage ?? point.ma20) as number)}원
        </span>
      )}
      {isFiniteNumber(point.ma5) && <span style={{ color: '#22c55e' }}>5일선 : {priceFormatter(point.ma5)}원</span>}
      {isFiniteNumber(point.ma20) && <span style={{ color: '#ef4444' }}>20일선 : {priceFormatter(point.ma20)}원</span>}
      {isFiniteNumber(point.ma60) && <span style={{ color: '#f59e0b' }}>60일선 : {priceFormatter(point.ma60)}원</span>}
      {isFiniteNumber(point.ma120) && <span style={{ color: '#8b5cf6' }}>120일선 : {priceFormatter(point.ma120)}원</span>}
      {point.action && <span>액션 : {point.action}</span>}
      {typeof point.position === 'number' && <span>포지션 : {point.position === 1 ? '보유' : '현금'}</span>}
    </div>
  );
}

type ChartPoint = PriceDataWithMA & {
  bodyRange: [number, number];
  wickRange: [number, number];
  volumeValue: number;
  buy: number | null;
  sell: number | null;
  action?: TradeSignal['action'];
  position?: TradeSignal['position'];
};

type CandleShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartPoint;
};

function CandleWick({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) {
  if (!payload) return null;
  const color = payload.close >= payload.open ? '#1769ff' : '#b42318';
  return <rect x={x + width / 2 - 0.5} y={y} width={1} height={Math.max(1, height)} fill={color} />;
}

function CandleBody({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) {
  if (!payload) return null;
  const isUp = payload.close >= payload.open;
  const color = isUp ? '#1769ff' : '#b42318';
  const bodyWidth = Math.max(2, Math.min(width * 0.72, 10));
  return (
    <rect
      x={x + width / 2 - bodyWidth / 2}
      y={height === 0 ? y - 0.5 : y}
      width={bodyWidth}
      height={Math.max(1, height)}
      fill={isUp ? '#ffffff' : color}
      stroke={color}
      strokeWidth={1.5}
    />
  );
}

export default function PriceSignalChart({ priceData, signals }: Props) {
  const signalByDate = useMemo(() => new Map(signals.map((signal) => [signal.date, signal])), [signals]);
  const chartData: ChartPoint[] = useMemo(
    () =>
      priceData.map((point) => {
        const signal = signalByDate.get(point.date);
        const bodyLow = Math.min(point.open, point.close);
        const bodyHigh = Math.max(point.open, point.close);
        return {
          ...point,
          movingAverage: point.movingAverage ?? point.ma20,
          bodyRange: [bodyLow, bodyHigh],
          wickRange: [point.low, point.high],
          volumeValue: point.volume,
          buy: signal?.action === 'BUY' ? point.close : null,
          sell: signal?.action === 'SELL' ? point.close : null,
          action: signal?.action,
          position: signal?.position,
        };
      }),
    [priceData, signalByDate]
  );

  const [range, setRange] = useState({ startIndex: 0, endIndex: Math.max(0, chartData.length - 1) });

  useEffect(() => {
    setRange({ startIndex: 0, endIndex: Math.max(0, chartData.length - 1) });
  }, [chartData]);

  const visibleData = useMemo(() => {
    if (!chartData.length) return [];
    const startIndex = Math.max(0, Math.min(range.startIndex, chartData.length - 1));
    const endIndex = Math.max(startIndex, Math.min(range.endIndex, chartData.length - 1));
    return chartData.slice(startIndex, endIndex + 1);
  }, [chartData, range.endIndex, range.startIndex]);

  const rangeLabel = useMemo(() => {
    if (!chartData.length || !visibleData.length) return null;
    return {
      startDate: visibleData[0]?.date ?? '-',
      endDate: visibleData[visibleData.length - 1]?.date ?? '-',
      count: visibleData.length,
    };
  }, [chartData.length, visibleData]);

  const priceDomain = useMemo(() => {
    const points = visibleData.length ? visibleData : chartData;
    const values = points.flatMap((point) => [
      point.low,
      point.high,
      point.ma5,
      point.ma20,
      point.ma60,
      point.ma120,
      point.movingAverage,
    ]);
    const numericValues = values.filter(isFiniteNumber);
    if (!numericValues.length) {
      return [0, 1] as [number, number];
    }

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const span = Math.max(max - min, 1);
    const padding = Math.max(span * 0.08, 1000);
    const lower = Math.max(0, Math.floor((min - padding) / 100) * 100);
    const upper = Math.ceil((max + padding) / 100) * 100;
    return [lower, upper] as [number, number];
  }, [chartData, visibleData]);

  const volumeDomain = useMemo(() => {
    const points = visibleData.length ? visibleData : chartData;
    const volumes = points.map((point) => point.volume).filter(isFiniteNumber);
    if (!volumes.length) {
      return [0, 1] as [number, number];
    }
    const max = Math.max(...volumes);
    const upper = Math.max(1, Math.ceil((max * 1.1) / 1000000) * 1000000);
    return [0, upper] as [number, number];
  }, [chartData, visibleData]);

  const handleBrushChange = (nextRange: { startIndex?: number; endIndex?: number } | undefined) => {
    if (!nextRange) return;
    if (typeof nextRange.startIndex !== 'number' || typeof nextRange.endIndex !== 'number') return;
    const startIndex = Math.max(0, Math.min(nextRange.startIndex, chartData.length - 1));
    const endIndex = Math.max(startIndex, Math.min(nextRange.endIndex, chartData.length - 1));
    setRange({ startIndex, endIndex });
  };

  const resetRange = () => {
    setRange({ startIndex: 0, endIndex: Math.max(0, chartData.length - 1) });
  };

  return (
    <div className="chart-frame" aria-label="가격 캔들, 이동평균선, 매수 매도 지점 차트">
      <div className="chart-toolbar">
        <div className="chart-zoom-note">
          아래 기간 슬라이더의 양쪽 손잡이를 움직이면 표시 구간만 확대/축소됩니다. KRX 원본 데이터와 백테스트 계산 결과는 변경되지 않습니다.
          {rangeLabel && (
            <span className="chart-range-label">
              표시 구간: {rangeLabel.startDate} ~ {rangeLabel.endDate} / {rangeLabel.count}개 거래일
            </span>
          )}
        </div>
        <button type="button" className="chart-reset-button" onClick={resetRange}>
          전체 보기
        </button>
      </div>
      <div className="chart-ma-legend" aria-label="이동평균선 범례">
        <strong>이동평균</strong>
        {maLegend.map((item) => (
          <span key={item.key} style={{ color: item.color }}>
            {item.label}
          </span>
        ))}
        <span className="strategy-line-label">굵은 파란선: 현재 전략 기준선</span>
      </div>
      <ResponsiveContainer width="100%" height={500}>
        <ComposedChart
          data={visibleData}
          syncId="price-signal-chart"
          margin={{ top: 10, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke="#e5e8eb" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            minTickGap={36}
            tick={{ fill: '#636b78', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={priceFormatter}
            tick={{ fill: '#636b78', fontSize: 12 }}
            tickLine={false}
            width={58}
            domain={priceDomain}
          />
          <Tooltip content={<PriceTooltip />} />
          <Bar dataKey="wickRange" name="고가-저가" shape={<CandleWick />} isAnimationActive={false} />
          <Bar dataKey="bodyRange" name="캔들" shape={<CandleBody />} isAnimationActive={false} />
          <Line type="monotone" dataKey="ma5" name="5일선" stroke="#22c55e" strokeWidth={1.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="ma20" name="20일선" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="ma60" name="60일선" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="ma120" name="120일선" stroke="#8b5cf6" strokeWidth={1.5} dot={false} connectNulls={false} />
          <Line
            type="monotone"
            dataKey="movingAverage"
            name="전략 기준선"
            stroke="#1769ff"
            strokeWidth={3}
            dot={false}
            connectNulls={false}
          />
          <Scatter dataKey="buy" name="BUY" fill="#1769ff" shape="circle" />
          <Scatter dataKey="sell" name="SELL" fill="#b42318" shape="circle" />
        </ComposedChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={visibleData} syncId="price-signal-chart" margin={{ top: 8, right: 16, bottom: 18, left: 8 }}>
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="date"
            minTickGap={36}
            tick={{ fill: '#8b95a1', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            orientation="right"
            domain={volumeDomain}
            tickFormatter={(value: number) => `${priceFormatter(value / 1000000)}m`}
            tick={{ fill: '#8b95a1', fontSize: 12 }}
            tickLine={false}
            width={52}
          />
          <Bar
            dataKey="volumeValue"
            name="거래량"
            fill="#c8d4e8"
            isAnimationActive={false}
            shape={({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) => {
              if (!payload) return null;
              const color = payload.close >= payload.open ? '#8bbcf6' : '#f3a1a6';
              return <rect x={x} y={y} width={Math.max(1, width)} height={Math.max(1, height)} fill={color} />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-navigator" aria-label="기간 선택 슬라이더">
        <ResponsiveContainer width="100%" height={72}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis hide domain={volumeDomain} />
            <Bar
              dataKey="volumeValue"
              name="거래량"
              fill="#dce4ef"
              isAnimationActive={false}
              shape={({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) => {
                if (!payload) return null;
                const color = payload.close >= payload.open ? '#8bbcf6' : '#f3a1a6';
                return <rect x={x} y={y} width={Math.max(1, width)} height={Math.max(1, height)} fill={color} />;
              }}
            />
            <Brush
              dataKey="date"
              height={24}
              travellerWidth={10}
              stroke="#1769ff"
              fill="#f7f8fa"
              startIndex={range.startIndex}
              endIndex={range.endIndex}
              onChange={handleBrushChange}
              tickFormatter={(value) => String(value).slice(2)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
