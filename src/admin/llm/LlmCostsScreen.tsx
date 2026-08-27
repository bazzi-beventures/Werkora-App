import { useMemo } from 'react'
import { useKpiData } from '../kpis/useKpiData'
import { useDateRange } from '../kpis/useDateRange'
import { tickDM } from '../kpis/dateRange'
import DateRangeBar from '../kpis/components/DateRangeBar'
import type {
  ColumnDef,
  KpiLlmKostenEndpunktRow,
  KpiLlmKostenModellRow,
  KpiLlmKostenBenutzerRow,
} from '../kpis/types'
import KpiCards from '../kpis/components/KpiCards'
import DataTable from '../kpis/components/DataTable'
import BiBarChart from '../kpis/components/BiBarChart'
import '../kpis/kpi-dashboard.css'

// Mistral rechnet in USD ab; llm_usage_log speichert cost_usd. Anzeige in CHF
// mit einem dokumentierten Festkurs — bewusst eine Näherung (kein Live-FX).
const USD_TO_CHF = 0.9

const chf = (usd: number) =>
  `CHF ${(usd * USD_TO_CHF).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rappen = (usd: number) =>
  `${(usd * USD_TO_CHF * 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Rp.`
const intnum = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('de-CH') : '—')
const chfCell = (v: unknown) => (typeof v === 'number' ? chf(v) : '—')
const pctCell = (v: unknown) => (typeof v === 'number' ? `${v.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %` : '—')

// Endpunkt-Namen leserlich machen; unbekannte fallen auf den Rohwert zurück.
const ENDPOINT_LABELS: Record<string, string> = {
  help_bot: 'Hilfe-Bot (Chat)',
  help_embed: 'Hilfe-Bot (Embedding)',
  pwa_chat: 'PWA-Chat',
  kpi: 'KPI-Analyse',
  material: 'Material-Matching',
  voice: 'Sprache (Voxtral)',
  ocr: 'OCR / Dokumente',
  pdf_ocr: 'PDF-OCR',
}
const endpointLabel = (e: string) => ENDPOINT_LABELS[e] ?? e

interface BreakdownRow {
  name: string
  calls: number
  total_tokens: number
  kosten_usd: number
  anteil_pct: number
}

type Aggregable = { calls: number; total_tokens: number; kosten_usd: number }

function aggregate<T extends Aggregable>(rows: T[], nameOf: (r: T) => string): BreakdownRow[] {
  const m = new Map<string, BreakdownRow>()
  let total = 0
  for (const r of rows) {
    const name = nameOf(r)
    const cur = m.get(name) ?? { name, calls: 0, total_tokens: 0, kosten_usd: 0, anteil_pct: 0 }
    cur.calls += r.calls
    cur.total_tokens += r.total_tokens
    cur.kosten_usd += r.kosten_usd
    m.set(name, cur)
    total += r.kosten_usd
  }
  const out = Array.from(m.values())
  out.forEach((o) => { o.anteil_pct = total > 0 ? (o.kosten_usd / total) * 100 : 0 })
  return out.sort((a, b) => b.kosten_usd - a.kosten_usd)
}

const BREAKDOWN_COLUMNS: ColumnDef<BreakdownRow>[] = [
  { key: 'name', label: 'Name' },
  { key: 'calls', label: 'Anfragen', align: 'right', format: intnum },
  { key: 'total_tokens', label: 'Tokens', align: 'right', format: intnum },
  { key: 'kosten_usd', label: 'Kosten', align: 'right', format: chfCell },
  { key: 'anteil_pct', label: 'Anteil', align: 'right', format: pctCell },
]

export default function LlmCostsScreen() {
  // Zeitraum-Filter (Default: letzte 30 Tage). Treibt ALLES — server-seitig
  // gefiltert, damit nur der gewählte Bereich geladen wird (Cap-sicher).
  const range = useDateRange('30t')
  const { filters } = range

  const endpunkt = useKpiData<KpiLlmKostenEndpunktRow>('vw_kpi_llm_kosten_endpunkt', filters)
  const modell = useKpiData<KpiLlmKostenModellRow>('vw_kpi_llm_kosten_modell', filters)
  const benutzer = useKpiData<KpiLlmKostenBenutzerRow>('vw_kpi_llm_kosten_benutzer', filters)

  const epRows = endpunkt.data ?? []
  const moRows = modell.data ?? []
  const buRows = benutzer.data ?? []

  // endpoint ist NOT NULL → epRows decken ALLE Calls ab → Basis für Cards.
  const totals = useMemo(() => ({
    kostenUsd: epRows.reduce((s, r) => s + r.kosten_usd, 0),
    calls: epRows.reduce((s, r) => s + r.calls, 0),
    tokens: epRows.reduce((s, r) => s + r.total_tokens, 0),
  }), [epRows])

  const periodLabel = range.label

  const cards = useMemo(() => [
    { label: 'Kosten', value: chf(totals.kostenUsd), color: '#be123c', sub: periodLabel },
    { label: 'Anfragen (LLM-Calls)', value: intnum(totals.calls) },
    { label: 'Ø pro Anfrage', value: totals.calls > 0 ? rappen(totals.kostenUsd / totals.calls) : '—' },
    { label: 'Tokens gesamt', value: intnum(totals.tokens) },
  ], [totals, periodLabel])

  const chartData = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of epRows) m.set(r.datum, (m.get(r.datum) ?? 0) + r.kosten_usd)
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([datum, usd]) => ({ name: datum, Kosten: Math.round(usd * USD_TO_CHF * 100) / 100 }))
  }, [epRows])

  const endpunktAgg = useMemo(() => aggregate(epRows, (r) => endpointLabel(r.endpoint)), [epRows])
  const modellAgg = useMemo(() => aggregate(moRows, (r) => `${r.model} (${r.provider})`), [moRows])
  const benutzerAgg = useMemo(() => aggregate(buRows, (r) => r.benutzer_name), [buRows])

  const loading = endpunkt.loading || modell.loading || benutzer.loading
  const error = endpunkt.error || modell.error || benutzer.error

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">LLM-Kosten</div>
          <div className="admin-page-subtitle">
            API-Kosten pro Feature, Modell und Benutzer — Live aus llm_usage_log
          </div>
        </div>
      </div>

      {/* Datumsbereich-Filter: Presets + freie von/bis-Auswahl */}
      <DateRangeBar range={range} />

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>}
      {error && !loading && <div className="admin-error">{error}</div>}

      {!loading && !error && (
        <div className="kpi-bi-layout">
          <KpiCards cards={cards} columns={4} />

          <div className="admin-page-subtitle" style={{ marginTop: -4 }}>
            ≈ CHF · Kurs 1 USD = {USD_TO_CHF.toLocaleString('de-CH')} CHF · Cache-Treffer des Hilfe-Bots
            sind nicht enthalten (kein LLM-Call). Tipp: Auf einen Tagesbalken klicken zoomt auf diesen Tag.
          </div>

          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[{ dataKey: 'Kosten', label: 'Kosten (CHF)' }]}
            height={280}
            onBarClick={range.drillToDay}
            xInterval="preserveStartEnd"
            xTickFormatter={tickDM}
          />

          <h3 className="kpi-bi-section-title">Nach Feature / Endpunkt — {periodLabel}</h3>
          <DataTable data={endpunktAgg} columns={BREAKDOWN_COLUMNS} defaultSort={{ key: 'kosten_usd', dir: 'desc' }} />

          <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>Nach Modell — {periodLabel}</h3>
          <DataTable data={modellAgg} columns={BREAKDOWN_COLUMNS} defaultSort={{ key: 'kosten_usd', dir: 'desc' }} />

          <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>Nach Benutzer — {periodLabel}</h3>
          <DataTable data={benutzerAgg} columns={BREAKDOWN_COLUMNS} defaultSort={{ key: 'kosten_usd', dir: 'desc' }} />
        </div>
      )}
    </div>
  )
}
