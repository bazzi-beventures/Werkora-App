// v2
import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiProjektRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import MultiDropdown from '../components/MultiDropdown'

const chf = (v: unknown) =>
  typeof v === 'number'
    ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—'
const num = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'

/* ── Date presets ─────────────────────────────────────── */

type DatePreset = 'all' | 'year' | '3months' | 'month'

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'year', label: 'Dieses Jahr' },
  { key: '3months', label: 'Letzte 3 Monate' },
  { key: 'month', label: 'Letzter Monat' },
]

function presetFrom(p: DatePreset): string | null {
  const now = new Date()
  if (p === 'year') return `${now.getFullYear()}-01-01`
  if (p === '3months') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  }
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
  return null
}

function presetTo(p: DatePreset): string | null {
  if (p === 'month') {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)
  }
  return null
}

/* ── Table columns ────────────────────────────────────── */

const COLUMNS: ColumnDef<KpiProjektRow>[] = [
  { key: 'projekt_nummer', label: 'Nr.' },
  { key: 'projekt_name', label: 'Projekt' },
  {
    key: 'ist_abgeschlossen',
    label: 'Status',
    render: (_, row) => (
      <span className={`kpi-status-badge ${row.ist_abgeschlossen ? 'abgeschlossen' : 'offen'}`}>
        {row.ist_abgeschlossen ? 'Abgeschlossen' : 'Offen'}
      </span>
    ),
  },
  { key: 'anzahl_rapporte', label: 'Rapporte', align: 'right' },
  { key: 'total_arbeitsstunden', label: 'Stunden', align: 'right', format: num },
  { key: 'total_lohnkosten', label: 'Lohn (Verr.)', align: 'right', format: chf },
  { key: 'total_materialkosten', label: 'Material (Verr.)', align: 'right', format: chf },
  { key: 'total_kosten', label: 'Total (Verr.)', align: 'right', format: chf },
]

/* ── Component ────────────────────────────────────────── */

export default function ProjekteTab() {
  const { data, loading, error } = useKpiData<KpiProjektRow>('vw_kpi_projekt')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(['offen', 'abgeschlossen']))
  const [mitarbeiterSel, setMitarbeiterSel] = useState<Set<string> | null>(null) // null = all

  const mitarbeiterOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    data.forEach((r) => {
      if (r.mitarbeiter_liste) {
        r.mitarbeiter_liste.split(',').forEach((m) => {
          const name = m.trim()
          if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
        })
      }
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))
  }, [data])

  const allMitarbeiterNames = useMemo(
    () => new Set(mitarbeiterOptions.map((o) => o.value)),
    [mitarbeiterOptions],
  )
  const effectiveMitarbeiterSel = mitarbeiterSel ?? allMitarbeiterNames

  const statusOptions = useMemo(() => [
    { value: 'offen', count: data?.filter((r) => !r.ist_abgeschlossen).length ?? 0 },
    { value: 'abgeschlossen', count: data?.filter((r) => r.ist_abgeschlossen).length ?? 0 },
  ], [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const from = presetFrom(datePreset)
    const to = presetTo(datePreset)
    return data.filter((r) => {
      if (from) {
        if (!r.letzter_rapport || r.letzter_rapport < from) return false
      }
      if (to) {
        if (!r.letzter_rapport || r.letzter_rapport > to) return false
      }
      const statusVal = r.ist_abgeschlossen ? 'abgeschlossen' : 'offen'
      if (!statusSel.has(statusVal)) return false
      if (mitarbeiterSel !== null && mitarbeiterSel.size > 0) {
        const names = r.mitarbeiter_liste ? r.mitarbeiter_liste.split(',').map((m) => m.trim()) : []
        if (!names.some((n) => mitarbeiterSel.has(n))) return false
      }
      return true
    })
  }, [data, datePreset, statusSel, mitarbeiterSel])

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const aktiv = filtered.filter((r) => !r.ist_abgeschlossen).length
    const stunden = filtered.reduce((s, r) => s + r.total_arbeitsstunden, 0)
    // Fehlt einem Projekt der Preis/Stundensatz, ist seine Summe null (Migration
    // 20260815). Dann ist auch das Total unbekannt — eine Summe ueber die uebrigen
    // waere zu niedrig, ohne dass man es sieht.
    const kostenUnvollstaendig = filtered.some((r) => r.total_kosten == null)
    const kosten = filtered.reduce((s, r) => s + (r.total_kosten ?? 0), 0)
    const diffs = filtered.filter((r) => r.differenz_offerte_ist != null)
    const avgDiff = diffs.length
      ? diffs.reduce((s, r) => s + (r.differenz_offerte_ist ?? 0), 0) / diffs.length
      : 0
    return [
      { label: 'Projekte aktiv', value: String(aktiv) },
      { label: 'Total Stunden', value: num(stunden) as string },
      { label: 'Total Kosten', value: kostenUnvollstaendig ? '—' : chf(kosten) },
      { label: 'Ø Diff Offerte/Ist', value: chf(avgDiff), color: avgDiff >= 0 ? '#22c55e' : '#f87171' },
    ]
  }, [filtered])

  const chartData = useMemo(
    () =>
      filtered
        // Projekte mit unbekannten Kosten (null) fallen hier raus — ein Balken
        // waere entweder falsch hoch oder eine unerklaerte Luecke.
        .filter((r) => (r.total_kosten ?? 0) > 0)
        .sort((a, b) => (b.total_kosten ?? 0) - (a.total_kosten ?? 0))
        .slice(0, 12)
        .map((r) => ({
          name: r.projekt_name.slice(0, 18),
          Lohnkosten: r.total_lohnkosten,
          Materialkosten: r.total_materialkosten,
        })),
    [filtered],
  )

  function toggleStatus(v: string) {
    setStatusSel((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  function toggleMitarbeiter(v: string) {
    setMitarbeiterSel((prev) => {
      const base = prev ?? allMitarbeiterNames
      const next = new Set(base)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* Date presets */}
      <div className="kpi-date-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`kpi-date-btn${datePreset === p.key ? ' active' : ''}`}
            onClick={() => setDatePreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Cards — horizontal 4 columns */}
      <KpiCards cards={cards} columns={4} />

      {/* Horizontal filter bar */}
      <div className="kpi-filter-bar">
        <MultiDropdown
          label="Status"
          options={statusOptions}
          selected={statusSel}
          onToggle={toggleStatus}
          onToggleAll={(all) => setStatusSel(all ? new Set(['offen', 'abgeschlossen']) : new Set())}
        />
        {mitarbeiterOptions.length > 0 && (
          <MultiDropdown
            label="Mitarbeiter"
            options={mitarbeiterOptions}
            selected={effectiveMitarbeiterSel}
            onToggle={toggleMitarbeiter}
            onToggleAll={(all) => setMitarbeiterSel(all ? null : new Set())}
          />
        )}
        <span className="kpi-filter-count">{filtered.length} Projekte</span>
      </div>

      {/* Chart — full width above table */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Lohnkosten', color: '#f59e0b', label: 'Lohn (Verr.)' },
          { dataKey: 'Materialkosten', color: '#3b82f6', label: 'Material (Verr.)' },
        ]}
        height={300}
      />

      {/* Full-width table */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'total_kosten', dir: 'desc' }} />
    </div>
  )
}
