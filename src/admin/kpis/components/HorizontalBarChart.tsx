import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useChartTheme } from './useChartTheme'

interface Props {
  data: Record<string, unknown>[]
  yKey: string
  dataKey: string
  color: string
  height?: number
}

export default function HorizontalBarChart({ data, yKey, dataKey, color, height }: Props) {
  const t = useChartTheme()
  if (!data.length) return null

  const rowHeight = 36
  const calculatedHeight = height ?? Math.max(120, data.length * rowHeight + 40)

  return (
    <div className="kpi-bi-chart-wrap">
      <ResponsiveContainer width="100%" height={calculatedHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: t.tickMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey={yKey}
            tick={{ fill: t.tickStrong, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip
            contentStyle={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderRadius: 8,
              color: t.tooltipText,
              fontSize: 12,
            }}
            formatter={(value: unknown) => [`${value} Tage`, 'Total']}
          />
          <Bar dataKey={dataKey} fill={color} radius={[0, 3, 3, 0]} label={{ position: 'right', fill: t.tickMuted, fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
