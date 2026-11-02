import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { KpiDiagramm } from '../../../api/admin/kpiAssistent'
import { useChartTheme } from '../../components/useChartTheme'
import {
  diagrammZeilen, formatWert, hatNegative, kompakt, reihenFarben, reihenSchluessel, umbrechen,
} from '../diagramm'

// Ein Diagramm im Chat des Kennzahlen-Assistenten (docs/specs/kennzahlen-assistent.md
// §8 Phase 5). Die Werte kommen fertig vom Server; das Modell hat nur Art und
// Parameter gewählt. Gezeichnet wird mit denselben Theme-Farben wie die Reiter
// (useChartTheme: Hell und Dunkel aus index.css), eine Achse, eine Einheit.
//
// Unter dem Diagramm stehen die Hinweise des Servers (laufender Monat, fehlende
// Vorjahreszahlen …) und die Werte als Tabelle zum Aufklappen — wer eine Zahl
// abschreiben will oder das Diagramm nicht sehen kann, liest sie dort.

interface Props {
  diagramm: KpiDiagramm
}

interface TickProps {
  x?: number | string
  y?: number | string
  payload?: { value?: unknown }
}

const ZEILENHOEHE = 12

/** Achsenbeschriftung auf höchstens zwei Zeilen (`umbrechen`). recharts bricht
 *  selbst nur an Leerzeichen um; ein langes Wort lief aus der Fläche. */
function KategorieTick({ x, y, payload, achse, fill }: TickProps & { achse: 'x' | 'y'; fill: string }) {
  const zeilen = umbrechen(String(payload?.value ?? ''), achse === 'y' ? 17 : 7)
  const px = Number(x ?? 0)
  const py = Number(y ?? 0)
  // y-Achse: rechtsbündig, mehrere Zeilen um die Balkenmitte zentriert;
  // x-Achse: mittig unter der Säule.
  const start = achse === 'y' ? -((zeilen.length - 1) * ZEILENHOEHE) / 2 + 4 : 12
  return (
    <text x={px} y={py} fill={fill} fontSize={achse === 'y' ? 11 : 10} textAnchor={achse === 'y' ? 'end' : 'middle'}>
      {zeilen.map((z, i) => (
        <tspan key={i} x={achse === 'y' ? px - 4 : px} dy={i === 0 ? start : ZEILENHOEHE}>{z}</tspan>
      ))}
    </text>
  )
}

interface WertLabelProps {
  viewBox?: unknown
  value?: unknown
}

/** Wert neben dem Balken — immer rechts der Nulllinie, auch beim negativen
 *  Balken: dessen Ende liegt links an den Kategorie-Beschriftungen. */
function WertLabel({ viewBox, value, einheit, fill }: WertLabelProps & { einheit: string; fill: string }) {
  const box = viewBox as { x?: number; y?: number; width?: number; height?: number } | undefined
  if (typeof value !== 'number' || !box) return null
  const x = Math.max(box.x ?? 0, (box.x ?? 0) + (box.width ?? 0)) + 4
  const y = (box.y ?? 0) + (box.height ?? 0) / 2
  return (
    <text x={x} y={y} dy={4} fill={fill} fontSize={11} textAnchor="start">{kompakt(value, einheit)}</text>
  )
}

export default function AssistentDiagramm({ diagramm: d }: Props) {
  const t = useChartTheme()
  const zeilen = diagrammZeilen(d)
  const farben = reihenFarben(d.reihen, t.series, t.tickMuted)
  const negativ = hatNegative(d)
  const mehrereReihen = d.reihen.length > 1

  const tooltip = (
    <Tooltip
      cursor={{ fill: t.grid }}
      contentStyle={{
        background: t.tooltipBg,
        border: `1px solid ${t.tooltipBorder}`,
        borderRadius: 'var(--radius-sm)',
        color: t.tooltipText,
        fontSize: 12,
      }}
      formatter={(value, name) => [formatWert(typeof value === 'number' ? value : null, d.einheit), name]}
      labelFormatter={(label, payload) => {
        const zusatz = (payload?.[0]?.payload as { zusatz?: string } | undefined)?.zusatz
        return zusatz ? `${String(label)} · ${zusatz}` : label
      }}
    />
  )

  return (
    <figure className="kpi-assistent-diagramm" aria-label={d.titel}>
      <figcaption>
        <strong>{d.titel}</strong>
        {d.untertitel && <span>{d.untertitel}</span>}
      </figcaption>

      {d.form === 'balken' ? (
        <ResponsiveContainer width="100%" height={Math.max(120, zeilen.length * 32 + 16)}>
          <BarChart data={zeilen} layout="vertical" margin={{ top: 4, right: 52, left: 0, bottom: 4 }}>
            <XAxis type="number" hide domain={negativ ? ['dataMin', 'dataMax'] : [0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="kategorie"
              width={112}
              tick={(p: TickProps) => <KategorieTick {...p} achse="y" fill={t.tickStrong} />}
              axisLine={false}
              tickLine={false}
            />
            {negativ && <ReferenceLine x={0} stroke={t.axis} />}
            {tooltip}
            <Bar
              dataKey={reihenSchluessel(0)}
              name={d.reihen[0]?.name}
              fill={farben[0]}
              radius={[0, 3, 3, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={reihenSchluessel(0)}
                content={(p: WertLabelProps) => <WertLabel {...p} einheit={d.einheit} fill={t.tickMuted} />}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={zeilen} margin={{ top: 8, right: 4, left: 0, bottom: 4 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            {zeilen.length > 6 ? (
              // Monate: kurz genug für schräg gestellte Beschriftungen.
              <XAxis
                dataKey="kategorie"
                tick={{ fill: t.tickMuted, fontSize: 10 }}
                axisLine={{ stroke: t.axis }}
                tickLine={false}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={44}
              />
            ) : (
              // Wenige, längere Kategorien (Altersstufen): waagrecht, zweizeilig.
              <XAxis
                dataKey="kategorie"
                tick={(p: TickProps) => <KategorieTick {...p} achse="x" fill={t.tickMuted} />}
                axisLine={{ stroke: t.axis }}
                tickLine={false}
                interval={0}
                height={36}
              />
            )}
            <YAxis
              width={44}
              tick={{ fill: t.tickMuted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => kompakt(v, d.einheit)}
            />
            {negativ && <ReferenceLine y={0} stroke={t.axis} />}
            {tooltip}
            {mehrereReihen && (
              // In Reihenfolge der Reihen, nicht alphabetisch (Default von recharts).
              <Legend itemSorter="dataKey" wrapperStyle={{ fontSize: 11, color: t.tickMuted, paddingTop: 4 }} />
            )}
            {d.reihen.map((r, i) => (
              <Bar
                key={reihenSchluessel(i)}
                dataKey={reihenSchluessel(i)}
                name={r.name}
                fill={farben[i]}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {d.hinweise.length > 0 && (
        <ul className="kpi-assistent-diagramm-hinweise">
          {d.hinweise.map(h => <li key={h}>{h}</li>)}
        </ul>
      )}

      <details className="kpi-assistent-diagramm-tabelle">
        <summary>Werte als Tabelle</summary>
        <table>
          <thead>
            <tr>
              <th scope="col" />
              {d.reihen.map(r => <th key={r.name} scope="col">{r.name}</th>)}
              {d.zusatz && <th scope="col" />}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z, i) => (
              <tr key={`${z.kategorie}-${i}`}>
                <th scope="row">{z.kategorie}</th>
                {d.reihen.map(r => <td key={r.name}>{formatWert(r.werte[i], d.einheit)}</td>)}
                {d.zusatz && <td className="zusatz">{d.zusatz[i]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
