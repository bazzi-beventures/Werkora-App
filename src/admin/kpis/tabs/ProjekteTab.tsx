// v2
import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiProjektRow, ColumnDef } from '../types'
import { averageOrNull, finite, percentOrNull, sumOrNull } from '../aggregate'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import MultiDropdown from '../components/MultiDropdown'

// `finite` statt `typeof v === 'number'`: NaN ist eine Zahl und stand sonst als
// Text „CHF NaN" auf dem Schirm (siehe aggregate.ts).
const chf = (v: unknown) => {
  const n = finite(v)
  return n === null
    ? '—'
    : `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
const num = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : n.toLocaleString('de-CH', { maximumFractionDigits: 1 })
}
const chfSigned = (v: unknown) => {
  const n = finite(v)
  if (n === null) return '—'
  return `${n > 0 ? '+' : ''}CHF ${n.toLocaleString('de-CH', { maximumFractionDigits: 0 })}`
}
const pct = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : `${n.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %`
}
const signedColor = (v: number | null) =>
  v === null ? undefined : v >= 0 ? 'var(--success)' : 'var(--danger)'

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
  { key: 'total_kosten_intern', label: 'Eigenkosten', align: 'right', format: chf },
  { key: 'umsatz_gestellt', label: 'Umsatz', align: 'right', format: chf },
  {
    key: 'gewinn_gestellt',
    label: 'Gewinn',
    align: 'right',
    render: (_v, row) => (
      <span style={{ color: signedColor(finite(row.gewinn_gestellt)) }}>
        {chfSigned(row.gewinn_gestellt)}
      </span>
    ),
  },
  { key: 'marge_gestellt_pct', label: 'Marge %', align: 'right', format: pct },
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
    const stunden = sumOrNull(filtered, (r) => r.total_arbeitsstunden)
    // Fehlt einem Projekt der Preis/Stundensatz, ist seine Summe null (Migration
    // 20260815). Dann ist auch das Total unbekannt — eine Summe ueber die uebrigen
    // waere zu niedrig, ohne dass man es sieht. sumOrNull setzt genau das durch.
    const kosten = sumOrNull(filtered, (r) => r.total_kosten)
    const gewinn = sumOrNull(filtered, (r) => r.gewinn_gestellt)
    const umsatz = sumOrNull(filtered, (r) => r.umsatz_gestellt)
    const marge = percentOrNull(gewinn, umsatz)
    const avgDiff = averageOrNull(filtered, (r) => r.differenz_offerte_ist)
    return [
      { label: 'Projekte aktiv', value: String(aktiv), sub: `${filtered.length} im Filter` },
      { label: 'Total Stunden', value: num(stunden) },
      { label: 'Total Kosten', value: chf(kosten), sub: 'Verrechnung' },
      {
        label: 'Gewinn',
        value: chfSigned(gewinn),
        sub: marge === null ? 'Umsatz − Eigenkosten' : `${pct(marge)} Marge`,
        color: signedColor(gewinn),
      },
    ]
  }, [filtered])

  // Top/Flop nach Gewinn. Auf Projektebene zählt die GESTELLTE Basis: ob der
  // Kunde schon bezahlt hat, ist eine Debitoren-, keine Margenfrage. Projekte
  // ohne ermittelbaren Gewinn (fehlende Stammdaten) bleiben draussen statt mit
  // einer 0 in die Flop-Liste zu rutschen.
  const { top, flop } = useMemo(() => {
    const mitGewinn = filtered
      .filter((r) => finite(r.gewinn_gestellt) !== null)
      .sort((a, b) => (b.gewinn_gestellt ?? 0) - (a.gewinn_gestellt ?? 0))
    return { top: mitGewinn.slice(0, 5), flop: mitGewinn.slice(-5).reverse() }
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
          { dataKey: 'Lohnkosten', label: 'Lohn (Verr.)' },
          { dataKey: 'Materialkosten', label: 'Material (Verr.)' },
        ]}
        height={300}
      />

      {/* Top/Flop nach Gewinn — die Frage „welches Projekt ist lukrativ" in zwei Listen */}
      {(top.length > 0 || flop.length > 0) && (
        <div className="kpi-topflop">
          <TopFlopList title="Beste 5 nach Gewinn" rows={top} />
          <TopFlopList title="Schwächste 5 nach Gewinn" rows={flop} />
        </div>
      )}

      {/* Full-width table */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'gewinn_gestellt', dir: 'desc' }} />

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        <strong>Gewinn</strong> ist der Deckungsbeitrag: gestellter Umsatz minus interne Lohn-
        und Materialkosten. Gemeinkosten (Büro, Fahrzeuge, Miete) sind nicht enthalten.
        Projekte ohne hinterlegten Monatslohn oder Einkaufspreis zeigen „—" statt einer zu
        günstig gerechneten Zahl und erscheinen in keiner der beiden Listen.
      </div>
    </div>
  )
}

/** Kompakte Rangliste — bewusst ohne eigene Tabelle: fünf Zeilen, zwei Werte. */
function TopFlopList({ title, rows }: { title: string; rows: KpiProjektRow[] }) {
  if (!rows.length) return null
  return (
    <div className="kpi-topflop-card">
      <div className="kpi-topflop-title">{title}</div>
      {rows.map((r) => (
        <div key={r.projekt_id} className="kpi-topflop-row">
          <span className="kpi-topflop-name" title={r.projekt_name}>{r.projekt_name}</span>
          <span style={{ color: signedColor(finite(r.gewinn_gestellt)), whiteSpace: 'nowrap' }}>
            {chfSigned(r.gewinn_gestellt)}
          </span>
        </div>
      ))}
    </div>
  )
}
