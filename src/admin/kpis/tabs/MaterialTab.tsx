import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiMaterialRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import MultiDropdown from '../components/MultiDropdown'

const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'
const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

const COLUMNS: ColumnDef<KpiMaterialRow>[] = [
  { key: 'art_nr', label: 'Art.-Nr.' },
  { key: 'artikelname', label: 'Artikel' },
  { key: 'kategorie', label: 'Kategorie' },
  { key: 'lagerbestand', label: 'Bestand', align: 'right', format: num },
  { key: 'lagerwert', label: 'Lagerwert', align: 'right', format: chf },
  { key: 'total_verbrauch', label: 'Verbrauch', align: 'right', format: num },
  { key: 'reichweite_tage', label: 'Reichweite', align: 'right', format: (v) => v != null ? `${v} Tage` : '—' },
]

export default function MaterialTab() {
  const { data, loading, error } = useKpiData<KpiMaterialRow>('vw_kpi_material')
  const [kategorieSel, setKategorieSel] = useState<Set<string> | null>(null) // null = all
  const [lagerSel, setLagerSel] = useState<Set<string>>(new Set(['OK', 'Kritisch']))

  const kategorieOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    data.forEach((r) => {
      const k = r.kategorie ?? '(leer)'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))
  }, [data])

  const lagerOptions = useMemo(() => {
    if (!data) return []
    const kritisch = data.filter((r) => r.lager_kritisch).length
    return [
      { value: 'OK', count: data.length - kritisch },
      { value: 'Kritisch', count: kritisch },
    ]
  }, [data])

  const allKategorien = useMemo(() => new Set(kategorieOptions.map((o) => o.value)), [kategorieOptions])
  const effectiveKategorieSel = kategorieSel ?? allKategorien

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((r) => {
      if (kategorieSel !== null && kategorieSel.size > 0) {
        if (!kategorieSel.has(r.kategorie ?? '(leer)')) return false
      }
      const lagerVal = r.lager_kritisch ? 'Kritisch' : 'OK'
      if (lagerSel.size > 0 && !lagerSel.has(lagerVal)) return false
      return true
    })
  }, [data, kategorieSel, lagerSel])

  const chartData = useMemo(
    () =>
      filtered
        .filter((r) => r.total_verbrauch > 0)
        .sort((a, b) => b.total_verbrauch - a.total_verbrauch)
        .slice(0, 15)
        .map((r) => ({
          name: r.artikelname.slice(0, 16),
          Verbrauch: r.total_verbrauch,
          Reichweite: r.reichweite_tage ?? 0,
        })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const aktiv = filtered.filter((r) => r.ist_aktiv).length
    const kritisch = filtered.filter((r) => r.lager_kritisch).length
    const lagerwert = filtered.reduce((s, r) => s + r.lagerwert, 0)
    const v30 = filtered.reduce((s, r) => s + r.verbrauch_30_tage, 0)
    return [
      { label: 'Aktive Artikel', value: String(aktiv) },
      { label: 'Lager kritisch', value: String(kritisch), color: kritisch > 0 ? '#f87171' : '#22c55e' },
      { label: 'Lagerwert', value: chf(lagerwert) },
      { label: 'Verbrauch 30d', value: num(v30) as string },
    ]
  }, [filtered])

  function toggleKategorie(v: string) {
    setKategorieSel((prev) => {
      const base = prev ?? allKategorien
      const next = new Set(base)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  function toggleLager(v: string) {
    setLagerSel((prev) => {
      const next = new Set(prev)
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
      <div className="kpi-filter-bar">
        {kategorieOptions.length > 0 && (
          <MultiDropdown
            label="Kategorie"
            options={kategorieOptions}
            selected={effectiveKategorieSel}
            onToggle={toggleKategorie}
            onToggleAll={(all) => setKategorieSel(all ? null : new Set())}
          />
        )}
        <MultiDropdown
          label="Lagerstatus"
          options={lagerOptions}
          selected={lagerSel}
          onToggle={toggleLager}
          onToggleAll={(all) => setLagerSel(all ? new Set(['OK', 'Kritisch']) : new Set())}
        />
        <span className="kpi-filter-count">{filtered.length} Artikel</span>
      </div>

      {/* Chart — full width */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Verbrauch', color: '#3b82f6', label: 'Verbrauch (Stk)' },
          { dataKey: 'Reichweite', color: '#22c55e', label: 'Reichweite (Tage)' },
        ]}
        height={300}
      />

      {/* Table — full width */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'total_verbrauch', dir: 'desc' }} />
    </div>
  )
}
