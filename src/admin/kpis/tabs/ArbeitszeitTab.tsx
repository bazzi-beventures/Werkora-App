import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiMitarbeiterRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import MultiDropdown from '../components/MultiDropdown'

const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLUMNS: ColumnDef<KpiMitarbeiterRow>[] = [
  { key: 'mitarbeiter_name', label: 'Name' },
  { key: 'funktion', label: 'Funktion' },
  { key: 'total_rapportstunden', label: 'Rapportstd.', align: 'right', format: num },
  { key: 'total_stempelstunden', label: 'Stempelstd.', align: 'right', format: num },
  { key: 'ueberstunden_saldo_stunden', label: 'Überstunden', align: 'right', format: num },
  { key: 'ferientage_verbraucht', label: 'Ferien', align: 'right' },
  { key: 'krankheitstage', label: 'Krank', align: 'right' },
]

export default function ArbeitszeitTab() {
  const { data, loading, error } = useKpiData<KpiMitarbeiterRow>('vw_kpi_mitarbeiter')
  const [funktionSel, setFunktionSel] = useState<Set<string> | null>(null) // null = all

  const funktionOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    data.forEach((r) => {
      const f = r.funktion ?? '(leer)'
      counts.set(f, (counts.get(f) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))
  }, [data])

  const allFunktionen = useMemo(() => new Set(funktionOptions.map((o) => o.value)), [funktionOptions])
  const effectiveFunktionSel = funktionSel ?? allFunktionen

  const filtered = useMemo(() => {
    if (!data) return []
    if (funktionSel === null || funktionSel.size === 0) return data
    return data.filter((r) => funktionSel.has(r.funktion ?? '(leer)'))
  }, [data, funktionSel])

  const chartData = useMemo(
    () =>
      filtered
        .filter((r) => r.total_rapportstunden > 0 || r.total_stempelstunden > 0)
        .sort((a, b) => b.total_rapportstunden - a.total_rapportstunden)
        .slice(0, 15)
        .map((r) => ({
          name: r.kuerzel || r.mitarbeiter_name.slice(0, 10),
          Rapport: r.total_rapportstunden,
          Stempel: r.total_stempelstunden,
        })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const aktiv = filtered.filter((r) => r.total_rapportstunden > 0).length
    const avgStd = filtered.reduce((s, r) => s + r.durchschnitt_stunden_pro_tag, 0) / filtered.length
    const totalOt = filtered.reduce((s, r) => s + r.ueberstunden_saldo_stunden, 0)
    const totalKrank = filtered.reduce((s, r) => s + r.krankheitstage, 0)
    return [
      { label: 'Mitarbeiter aktiv', value: String(aktiv) },
      { label: 'Ø Stunden/Tag', value: num(avgStd) as string },
      { label: 'Total Überstunden', value: num(totalOt) as string, color: totalOt > 0 ? '#f59e0b' : '#22c55e' },
      { label: 'Krankheitstage', value: String(totalKrank), color: totalKrank > 10 ? '#f87171' : undefined },
    ]
  }, [filtered])

  function toggleFunktion(v: string) {
    setFunktionSel((prev) => {
      const base = prev ?? allFunktionen
      const next = new Set(base)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* KPI Cards */}
      <KpiCards cards={cards} columns={4} />

      {/* Horizontal filter bar */}
      {funktionOptions.length > 0 && (
        <div className="kpi-filter-bar">
          <MultiDropdown
            label="Funktion"
            options={funktionOptions}
            selected={effectiveFunktionSel}
            onToggle={toggleFunktion}
            onToggleAll={(all) => setFunktionSel(all ? null : new Set())}
          />
          <span className="kpi-filter-count">{filtered.length} Mitarbeiter</span>
        </div>
      )}

      {/* Chart — full width */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Rapport', color: '#f59e0b', label: 'Rapportstunden' },
          { dataKey: 'Stempel', color: '#3b82f6', label: 'Stempelstunden' },
        ]}
        height={300}
      />

      {/* Table — full width */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'total_rapportstunden', dir: 'desc' }} />
    </div>
  )
}
