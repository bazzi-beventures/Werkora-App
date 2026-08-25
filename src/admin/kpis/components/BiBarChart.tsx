import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useChartTheme } from './useChartTheme'

interface BarDef {
  dataKey: string
  color: string
  label: string
}

interface Props {
  data: Record<string, unknown>[]
  xKey: string
  bars: BarDef[]
  height?: number
  // Optional: macht die Balken klickbar (Drill-down). Bekommt den x-Wert
  // (z.B. das angeklickte Datum) des getroffenen Balkens.
  onBarClick?: (xValue: string) => void
  // Optional: x-Achsen-Tick-Intervall (Default 0 = alle Labels). Bei vielen
  // Tagesbalken 'preserveStartEnd' setzen, damit Labels nicht überlappen.
  xInterval?: number | 'preserveStartEnd' | 'preserveStart' | 'preserveEnd'
  // Optional: x-Label kürzen (z.B. ISO-Datum → 'dd.MM').
  xTickFormatter?: (value: string) => string
}

export default function BiBarChart({ data, xKey, bars, height = 260, onBarClick, xInterval, xTickFormatter }: Props) {
  const t = useChartTheme()
  if (!data.length) return null

  return (
    <div className="kpi-bi-chart-wrap" style={onBarClick ? { cursor: 'pointer' } : undefined}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          onClick={onBarClick
            ? (state: { activeLabel?: string | number }) => {
                if (state?.activeLabel != null) onBarClick(String(state.activeLabel))
              }
            : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: t.tickMuted, fontSize: 11 }}
            axisLine={{ stroke: t.axis }}
            tickLine={false}
            interval={xInterval ?? 0}
            tickFormatter={xTickFormatter}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: t.tickMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          />
          <Tooltip
            contentStyle={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderRadius: 8,
              color: t.tooltipText,
              fontSize: 12,
            }}
            formatter={(value: unknown) => typeof value === 'number' ? value.toLocaleString('de-CH') : String(value ?? '')}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: t.tickMuted, paddingTop: 8 }}
          />
          {bars.map((b) => (
            <Bar key={b.dataKey} dataKey={b.dataKey} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
