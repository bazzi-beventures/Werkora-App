import type { CSSProperties } from 'react'

interface CardDef {
  label: string
  value: string
  color?: string
  sub?: string
  subColor?: string
}

interface Props {
  cards: CardDef[]
  columns?: number
}

// `columns` steuert die Spaltenzahl über die CSS-Variable --kpi-cards-cols statt
// über ein Inline-`grid-template-columns`. Inline-Styles schlagen jede Media-Query,
// ein `columns={4}` hätte auf dem Handy vier ~80px-Kacheln erzwungen, die rechts
// aus dem Viewport laufen. Über die Variable kann kpi-dashboard.css auf schmalen
// Screens auf zwei bzw. eine Spalte zurückfallen.
export default function KpiCards({ cards, columns }: Props) {
  const style = columns
    ? ({ '--kpi-cards-cols': String(columns) } as CSSProperties)
    : undefined

  return (
    <div className="kpi-bi-cards" style={style}>
      {cards.map((c, i) => (
        <div key={i} className="kpi-bi-card">
          <div className="kpi-bi-card-label">{c.label}</div>
          <div className="kpi-bi-card-value" style={c.color ? { color: c.color } : undefined}>
            {c.value}
          </div>
          {c.sub && <div className="kpi-bi-card-sub" style={c.subColor ? { color: c.subColor } : undefined}>{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}
