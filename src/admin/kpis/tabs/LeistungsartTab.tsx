import { useMemo, useState } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiLeistungsartMonatRow, KpiMaterialLeistungsartRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import { WORK_TYPES, workTypeLabel } from '../../../api/workTypes'

const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLOR: Record<string, string> = {
  Neumontage:    '#15803d',
  Wiedermontage: '#84cc16',
  Umbau:         '#b45309',
  Reparatur:     '#be123c',
  Wartung:       '#0ea5e9',
  Demontage:     '#6b7280',
}

const COLUMNS: ColumnDef<KpiLeistungsartMonatRow>[] = [
  { key: 'monat',              label: 'Monat' },
  { key: 'art_der_arbeit',     label: 'Leistungsart', format: (v) => workTypeLabel(v as string) || '— nicht gesetzt —' },
  { key: 'total_stunden',      label: 'Stunden',       align: 'right', format: num },
  { key: 'anzahl_sessions',    label: 'Sessions',      align: 'right' },
  { key: 'anzahl_mitarbeiter', label: 'Mitarbeiter',   align: 'right' },
]

const chf = (v: unknown) =>
  typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { maximumFractionDigits: 0 })}` : '—'

const MATERIAL_COLUMNS: ColumnDef<KpiMaterialLeistungsartRow>[] = [
  { key: 'art_der_arbeit',            label: 'Leistungsart', format: (v) => workTypeLabel(v as string) || (v as string) },
  { key: 'anzahl_artikel',            label: 'Artikel',        align: 'right' },
  { key: 'anzahl_buchungen',          label: 'Buchungen',      align: 'right' },
  { key: 'total_materialkosten',      label: 'Materialkosten', align: 'right', format: chf },
  { key: 'total_materialkosten_intern', label: 'Einkauf (intern)', align: 'right', format: chf },
]

function monthsBack(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out.reverse()
}

export default function LeistungsartTab() {
  const { data, loading, error } = useKpiData<KpiLeistungsartMonatRow>('vw_kpi_leistungsart_monat')
  const material = useKpiData<KpiMaterialLeistungsartRow>('vw_kpi_material_leistungsart')
  const [range, setRange] = useState<3 | 6 | 12>(6)

  const months = useMemo(() => monthsBack(range), [range])

  const filtered = useMemo(() => {
    if (!data) return []
    const set = new Set(months)
    return data.filter(r => set.has(r.monat))
  }, [data, months])

  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>()
    for (const m of months) map.set(m, { monat: m, Neumontage: 0, Wiedermontage: 0, Umbau: 0, Reparatur: 0, Wartung: 0, Demontage: 0 })
    for (const r of filtered) {
      const row = map.get(r.monat)
      if (!row) continue
      const key = r.art_der_arbeit ?? 'Unbekannt'
      row[key] = (row[key] as number ?? 0) + r.total_stunden
    }
    return Array.from(map.values())
  }, [filtered, months])

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const totals = new Map<string, number>()
    for (const r of filtered) {
      const key = r.art_der_arbeit ?? 'Unbekannt'
      totals.set(key, (totals.get(key) ?? 0) + r.total_stunden)
    }
    const grand = Array.from(totals.values()).reduce((a, b) => a + b, 0)
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]
    return [
      { label: 'Total Stunden', value: num(grand) as string },
      { label: 'Häufigste Art', value: top ? workTypeLabel(top[0]) || top[0] : '—' },
      { label: 'Wartung Stunden', value: num(totals.get('Wartung') ?? 0) as string, color: COLOR.Wartung },
      { label: 'Reparatur Stunden', value: num(totals.get('Reparatur') ?? 0) as string, color: COLOR.Reparatur },
    ]
  }, [filtered])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={4} />

      <div className="kpi-filter-bar">
        <div style={{ display: 'flex', gap: 6 }}>
          {[3, 6, 12].map(n => (
            <button
              key={n}
              className={`kpi-admin-tab${range === n ? ' active' : ''}`}
              style={{ padding: '6px 12px', fontSize: 13 }}
              onClick={() => setRange(n as 3 | 6 | 12)}
            >
              {n} Monate
            </button>
          ))}
        </div>
        <span className="kpi-filter-count">{filtered.length} Zeilen</span>
      </div>

      <BiBarChart
        data={chartData}
        xKey="monat"
        bars={WORK_TYPES.map(t => ({ dataKey: t.value, color: COLOR[t.value], label: t.label }))}
        height={320}
      />

      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'monat', dir: 'desc' }} />

      <div style={{ marginTop: 20, fontWeight: 600, fontSize: 15 }}>Material pro Leistungsart (gesamt)</div>
      <DataTable
        data={material.data ?? []}
        columns={MATERIAL_COLUMNS}
        defaultSort={{ key: 'total_materialkosten', dir: 'desc' }}
      />
    </div>
  )
}
