import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EquityPoint } from '@/lib/backtest/types';

type Props = {
  data: EquityPoint[];
};

const compactCurrency = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value / 100000000)}억`;

export default function EquityCurveChart({ data }: Props) {
  return (
    <div className="chart-frame" aria-label="자산 곡선 차트">
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#e5e8eb" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            minTickGap={36}
            tick={{ fill: '#636b78', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={compactCurrency}
            tick={{ fill: '#636b78', fontSize: 12 }}
            tickLine={false}
            width={58}
          />
          <Tooltip
            formatter={(value: number, name) => [
              new Intl.NumberFormat('ko-KR', {
                style: 'currency',
                currency: 'KRW',
                maximumFractionDigits: 0,
              }).format(value),
              name === 'strategyEquity' ? '20일선 전략' : '단순 보유',
            ]}
            labelFormatter={(label) => `날짜 ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="strategyEquity"
            name="20일선 전략"
            stroke="#1769ff"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="buyAndHoldEquity"
            name="단순 보유"
            stroke="#111318"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
