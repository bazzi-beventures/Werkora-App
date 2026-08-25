import { useEffect, useMemo, useState } from 'react'
import { fetchProjektPipeline } from '../../../api/kpiViews'
import type { ColumnDef, PipelineProjektRow } from '../types'
import { aggregatePipeline, leiterName } from '../pipelineAggregation'
import type { PipelineLeiterAgg, PipelineProjektAgg } from '../pipelineAggregation'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import MultiDropdown from '../components/MultiDropdown'
import ProjektDrillModal from '../components/ProjektDrillModal'

const chf = (v: unknown) =>
  typeof v === 'number'
    ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—'

const nChf = (n: number, betrag: number) => (
  <span>
    {n}
    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {chf(betrag)}</span>
  </span>
)

/* ── Date presets (wie ProjekteTab, plus eigener Zeitraum) ── */

type DatePreset = 'all' | 'year' | '3months' | 'month' | 'custom'

const PRESETS: { key: Exclude<DatePreset, 'custom'>; label: string }[] = [
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

const LEITER_COLUMNS: ColumnDef<PipelineLeiterAgg>[] = [
  { key: 'projektleiter', label: 'Projektleiter' },
  { key: 'projekte', label: 'Projekte', align: 'right' },
  { key: 'offertenOffen', label: 'Offerten offen', align: 'right', render: (_, r) => nChf(r.offertenOffen, r.offertenOffenChf) },
  { key: 'offertenVersendet', label: 'davon versendet', align: 'right' },
  { key: 'offertenAkzeptiert', label: 'Akzeptiert', align: 'right', render: (_, r) => nChf(r.offertenAkzeptiert, r.offertenAkzeptiertChf) },
  { key: 'projekteMitRapport', label: 'Mit Rapport', align: 'right' },
  { key: 'rechnungenVersendet', label: 'Rechnungen', align: 'right', render: (_, r) => nChf(r.rechnungenVersendet, r.rechnungenChf) },
  { key: 'rechnungenBezahlt', label: 'Bezahlt', align: 'right', render: (_, r) => nChf(r.rechnungenBezahlt, r.bezahltChf) },
]

const PROJEKT_COLUMNS: ColumnDef<PipelineProjektAgg>[] = [
  { key: 'projektNummer', label: 'Nr.' },
  { key: 'projektName', label: 'Projekt' },
  { key: 'kunde', label: 'Kunde' },
  { key: 'projektleiter', label: 'Projektleiter' },
  { key: 'offertenOffen', label: 'Off. offen', align: 'right' },
  { key: 'offertenOffenChf', label: 'Offertenbetrag', align: 'right', format: chf },
  { key: 'offertenAkzeptiert', label: 'Akzeptiert', align: 'right' },
  { key: 'rapporte', label: 'Rapporte', align: 'right' },
  { key: 'rechnungenChf', label: 'Fakturiert', align: 'right', format: chf },
  { key: 'bezahltChf', label: 'Bezahlt', align: 'right', format: chf },
]

/* ── Component ────────────────────────────────────────── */

export default function PipelineTab() {
  const [data, setData] = useState<PipelineProjektRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [datePreset, setDatePreset] = useState<DatePreset>('year')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [plSel, setPlSel] = useState<Set<string> | null>(null) // null = alle
  const [search, setSearch] = useState('')
  const [drill, setDrill] = useState<PipelineProjektAgg | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchProjektPipeline<PipelineProjektRow>()
      .then((rows) => { if (!cancelled) { setData(rows); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Daten konnten nicht geladen werden.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const plOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    data.forEach((r) => {
      const name = leiterName(r)
      counts.set(name, (counts.get(name) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))
  }, [data])

  const allPlNames = useMemo(() => new Set(plOptions.map((o) => o.value)), [plOptions])
  const effectivePlSel = plSel ?? allPlNames

  const from = datePreset === 'custom' ? (customFrom || null) : presetFrom(datePreset)
  const to = datePreset === 'custom' ? (customTo || null) : presetTo(datePreset)

  const { perLeiter, perProjekt } = useMemo(
    () => aggregatePipeline(data ?? [], { from, to, projektleiter: plSel, search }),
    [data, from, to, plSel, search],
  )

  const cards = useMemo(() => {
    const t = perLeiter.reduce(
      (acc, l) => ({
        offen: acc.offen + l.offertenOffen,
        offenChf: acc.offenChf + l.offertenOffenChf,
        akzeptiert: acc.akzeptiert + l.offertenAkzeptiert,
        akzeptiertChf: acc.akzeptiertChf + l.offertenAkzeptiertChf,
        rechnungen: acc.rechnungen + l.rechnungenVersendet,
        rechnungenChf: acc.rechnungenChf + l.rechnungenChf,
        bezahlt: acc.bezahlt + l.rechnungenBezahlt,
        bezahltChf: acc.bezahltChf + l.bezahltChf,
      }),
      { offen: 0, offenChf: 0, akzeptiert: 0, akzeptiertChf: 0, rechnungen: 0, rechnungenChf: 0, bezahlt: 0, bezahltChf: 0 },
    )
    return [
      { label: 'Offerten offen', value: String(t.offen), sub: chf(t.offenChf) },
      { label: 'Offerten akzeptiert', value: String(t.akzeptiert), sub: chf(t.akzeptiertChf) },
      { label: 'Rechnungen versendet', value: String(t.rechnungen), sub: chf(t.rechnungenChf) },
      { label: 'Bezahlt', value: String(t.bezahlt), sub: chf(t.bezahltChf), color: '#22c55e' },
    ]
  }, [perLeiter])

  const chartData = useMemo(
    () =>
      [...perLeiter]
        .sort((a, b) => (b.offertenOffenChf + b.rechnungenChf) - (a.offertenOffenChf + a.rechnungenChf))
        .slice(0, 12)
        .map((l) => ({
          name: l.projektleiter.slice(0, 18),
          'Offerten offen': Math.round(l.offertenOffenChf),
          Fakturiert: Math.round(l.rechnungenChf),
          Bezahlt: Math.round(l.bezahltChf),
        })),
    [perLeiter],
  )

  function togglePl(v: string) {
    setPlSel((prev) => {
      const base = prev ?? allPlNames
      const next = new Set(base)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  // Klick auf eine Projektleiter-Zeile: nur diesen Leiter filtern; erneuter Klick
  // auf den bereits allein gewählten Leiter hebt den Filter wieder auf. Der
  // Datumsfilter bleibt dabei unberührt.
  function selectLeiter(name: string) {
    setPlSel((prev) => (prev && prev.size === 1 && prev.has(name) ? null : new Set([name])))
  }

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* Date presets + eigener Zeitraum */}
      <div className="kpi-date-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`kpi-date-btn${datePreset === p.key ? ' active' : ''}`}
            onClick={() => { setDatePreset(p.key); setCustomFrom(''); setCustomTo('') }}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date"
          className="admin-input"
          style={{ width: 'auto' }}
          value={customFrom}
          onChange={(e) => { setCustomFrom(e.target.value); setDatePreset('custom') }}
          aria-label="Von"
        />
        <input
          type="date"
          className="admin-input"
          style={{ width: 'auto' }}
          value={customTo}
          onChange={(e) => { setCustomTo(e.target.value); setDatePreset('custom') }}
          aria-label="Bis"
        />
      </div>

      <KpiCards cards={cards} columns={4} />

      {/* Filter bar */}
      <div className="kpi-filter-bar">
        {plOptions.length > 0 && (
          <MultiDropdown
            label="Projektleiter"
            options={plOptions}
            selected={effectivePlSel}
            onToggle={togglePl}
            onToggleAll={(all) => setPlSel(all ? null : new Set())}
          />
        )}
        <input
          className="admin-input"
          style={{ width: 220 }}
          placeholder="Projekt oder Kunde suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="kpi-filter-count">{perLeiter.length} Projektleiter · {perProjekt.length} Projekte</span>
      </div>

      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Offerten offen', color: '#f59e0b', label: 'Offerten offen (CHF)' },
          { dataKey: 'Fakturiert', color: '#3b82f6', label: 'Fakturiert (CHF)' },
          { dataKey: 'Bezahlt', color: '#22c55e', label: 'Bezahlt (CHF)' },
        ]}
        height={300}
      />

      {/* Pipeline pro Projektleiter */}
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Zeile anklicken, um nach diesem Projektleiter zu filtern (nochmal klicken hebt den Filter auf).
      </div>
      <DataTable
        data={perLeiter}
        columns={LEITER_COLUMNS}
        defaultSort={{ key: 'offertenOffen', dir: 'desc' }}
        onRowClick={(r) => selectLeiter(r.projektleiter)}
      />

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Offerten zählen aufs Erstellungsdatum, Rapporte aufs Rapportdatum, Rechnungen auf Versand- bzw. Zahlungsdatum.
        Archivierte Offerten (ersetzte Versionen) und archivierte/inaktive Rechnungen sind ausgeklammert;
        pro Projekt zählt nur die aktuellste Rechnung (Fehlversand-/Ersatz-Zeilen zählen nicht doppelt).
        Projekt-Zeile anklicken für die Detail-Ansicht.
      </div>

      {/* Drill-down: einzelne Projekte */}
      <DataTable
        data={perProjekt}
        columns={PROJEKT_COLUMNS}
        defaultSort={{ key: 'rechnungenChf', dir: 'desc' }}
        onRowClick={(r) => setDrill(r)}
      />

      {drill && (
        <ProjektDrillModal projekt={drill} from={from} to={to} onClose={() => setDrill(null)} />
      )}
    </div>
  )
}
