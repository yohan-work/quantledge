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
import type { DrawdownPoint } from '@/lib/backtest/types';

type Props = {
  data: DrawdownPoint[];
};

const percent = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);

export default function DrawdownChart({ data }: Props) {
  return (
    <div className="chart-frame" aria-label="Drawdown 차트">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#e5e8eb" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            minTickGap={36}
            tick={{ fill: '#636b78', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={percent}
            tick={{ fill: '#636b78', fontSize: 12 }}
            tickLine={false}
            width={54}
          />
          <Tooltip
            formatter={(value: number, name) => [
              percent(value),
              name === 'strategyDrawdown' ? '20일선 전략' : '단순 보유',
            ]}
            labelFormatter={(label) => `날짜 ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="strategyDrawdown"
            name="20일선 전략"
            stroke="#1769ff"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="buyAndHoldDrawdown"
            name="단순 보유"
            stroke="#636b78"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
