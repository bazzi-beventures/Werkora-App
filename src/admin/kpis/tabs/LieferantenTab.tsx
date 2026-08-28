import { useState, useEffect, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import { fetchLieferantenProjektware } from '../../../api/kpiViews'
import type {
  ColumnDef,
  KpiLieferantRow,
  LieferantProjektwareAntwort,
  LieferantProjektwareRow,
} from '../types'
import { finite, matchesSuche, percentOrNull, sumOrNull } from '../aggregate'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'

const chf = (v: unknown) => {
  const n = finite(v)
  return n === null
    ? '—'
    : `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
const chfSigned = (v: unknown) => {
  const n = finite(v)
  if (n === null) return '—'
  return `${n > 0 ? '+' : ''}CHF ${n.toLocaleString('de-CH', { maximumFractionDigits: 0 })}`
}
const num = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : n.toLocaleString('de-CH', { maximumFractionDigits: 1 })
}
const pct = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : `${n.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %`
}
const signedColor = (v: number | null) =>
  v === null ? undefined : v >= 0 ? 'var(--success)' : 'var(--danger)'

/* ── Zwei Warenströme, zwei Tabellen ──────────────────────
 *
 * Katalogware ist REALISIERT: verbaut, verrechnet, die Marge ist gefallen.
 * Projektware ist GEPLANT: sie steht in lebenden Offerten, bestellt und
 * geliefert ist sie damit nicht. Beide Zahlen zu addieren ergäbe eine Summe,
 * die weder das eine noch das andere ist — deshalb stehen sie nebeneinander.
 */

const KATALOG_COLUMNS: ColumnDef<KpiLieferantRow>[] = [
  { key: 'lieferant', label: 'Lieferant' },
  { key: 'artikel_anzahl', label: 'Artikel', align: 'right' },
  { key: 'positionen', label: 'Positionen', align: 'right' },
  { key: 'menge', label: 'Menge', align: 'right', format: num },
  { key: 'einkaufsvolumen', label: 'Einkauf', align: 'right', format: chf },
  { key: 'verkaufsvolumen', label: 'Verkauf', align: 'right', format: chf },
  {
    key: 'marge_chf',
    label: 'Marge',
    align: 'right',
    render: (_v, row) => (
      <span style={{ color: signedColor(finite(row.marge_chf)) }}>{chfSigned(row.marge_chf)}</span>
    ),
  },
  { key: 'marge_pct', label: 'Marge %', align: 'right', format: pct },
  { key: 'positionen_ek_geschaetzt', label: 'EK geschätzt', align: 'right' },
  { key: 'letzte_verwendung', label: 'Zuletzt verbaut' },
]

const PROJEKTWARE_COLUMNS: ColumnDef<LieferantProjektwareRow>[] = [
  { key: 'lieferant', label: 'Lieferant' },
  { key: 'offerten_anzahl', label: 'Offerten', align: 'right' },
  { key: 'positionen', label: 'Positionen', align: 'right' },
  { key: 'einkaufsvolumen', label: 'Einkauf (geplant)', align: 'right', format: chf },
  { key: 'verkaufsvolumen', label: 'Verkauf (geplant)', align: 'right', format: chf },
  {
    key: 'marge_chf',
    label: 'Marge (geplant)',
    align: 'right',
    render: (_v, row) => (
      <span style={{ color: signedColor(finite(row.marge_chf)) }}>{chfSigned(row.marge_chf)}</span>
    ),
  },
  { key: 'marge_pct', label: 'Marge %', align: 'right', format: pct },
  {
    key: 'margenfaktor_schnitt',
    label: 'Ø Faktor',
    align: 'right',
    format: (v) => {
      const n = finite(v)
      return n === null ? '—' : `${n.toLocaleString('de-CH', { maximumFractionDigits: 2 })}×`
    },
  },
  { key: 'positionen_ohne_ek', label: 'ohne EK', align: 'right' },
]

export default function LieferantenTab() {
  const { data, loading, error } = useKpiData<KpiLieferantRow>('vw_kpi_lieferant')
  const [projektware, setProjektware] = useState<LieferantProjektwareAntwort | null>(null)
  // Eigener Endpoint statt View — der Fehlerfall darf den Katalogteil nicht
  // mitreissen, deshalb ein eigener Status statt eines gemeinsamen Ladefehlers.
  const [projektwareFehler, setProjektwareFehler] = useState(false)
  const [suche, setSuche] = useState('')

  useEffect(() => {
    let abgebrochen = false
    fetchLieferantenProjektware<LieferantProjektwareAntwort>()
      .then((res) => { if (!abgebrochen) setProjektware(res) })
      .catch(() => { if (!abgebrochen) setProjektwareFehler(true) })
    return () => { abgebrochen = true }
  }, [])

  const katalog = useMemo(() => {
    if (!data) return []
    return data.filter((r) => matchesSuche(suche, [r.lieferant]))
  }, [data, suche])

  const projektwareRows = useMemo(() => {
    if (!projektware) return []
    return projektware.rows.filter((r) => matchesSuche(suche, [r.lieferant]))
  }, [projektware, suche])

  const cards = useMemo(() => {
    const einkauf = sumOrNull(katalog, (r) => r.einkaufsvolumen)
    const verkauf = sumOrNull(katalog, (r) => r.verkaufsvolumen)
    const marge = sumOrNull(katalog, (r) => r.marge_chf)
    const margePct = percentOrNull(marge, verkauf)
    const geplant = projektware?.summe
    return [
      { label: 'Lieferanten', value: String(katalog.length), sub: 'mit verbauter Ware' },
      { label: 'Einkauf (realisiert)', value: chf(einkauf) },
      {
        label: 'Handelsmarge',
        value: chfSigned(marge),
        sub: margePct === null ? 'Verkauf − Einkauf' : `${pct(margePct)} auf ${chf(verkauf)}`,
        color: signedColor(marge),
      },
      {
        label: 'Einkauf (geplant)',
        value: geplant ? chf(geplant.einkaufsvolumen) : '—',
        sub: geplant ? `${geplant.offerten_anzahl} offene Offerten` : 'Projektware',
      },
      {
        label: 'Marge (geplant)',
        value: geplant ? chfSigned(geplant.marge_chf) : '—',
        sub: geplant?.margenfaktor_schnitt ? `Ø Faktor ${geplant.margenfaktor_schnitt}×` : undefined,
        color: geplant ? signedColor(geplant.marge_chf) : undefined,
      },
    ]
  }, [katalog, projektware])

  const chartData = useMemo(
    () =>
      katalog
        .filter((r) => finite(r.marge_chf) !== null)
        .sort((a, b) => (b.marge_chf ?? 0) - (a.marge_chf ?? 0))
        .slice(0, 12)
        .map((r) => ({
          name: r.lieferant.slice(0, 18),
          Einkauf: r.einkaufsvolumen,
          Marge: r.marge_chf,
        })),
    [katalog],
  )

  const geschaetzt = useMemo(
    () => katalog.reduce((s, r) => s + r.positionen_ek_geschaetzt, 0),
    [katalog],
  )

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={5} />

      <div className="kpi-filter-bar">
        <input
          className="kpi-filter-search"
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Lieferant…"
          aria-label="Lieferanten durchsuchen"
        />
        <span className="kpi-filter-count">{katalog.length} Lieferanten</span>
      </div>

      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Einkauf', label: 'Einkauf (realisiert)' },
          { dataKey: 'Marge', label: 'Handelsmarge' },
        ]}
        height={300}
      />

      <div className="kpi-section-title">Katalogware — realisierte Marge</div>
      <DataTable data={katalog} columns={KATALOG_COLUMNS} defaultSort={{ key: 'marge_chf', dir: 'desc' }} />

      <div className="kpi-section-title">Projektware aus Offerten — geplante Marge</div>
      {projektwareFehler ? (
        <div className="admin-error">Projektware konnte nicht geladen werden.</div>
      ) : (
        <DataTable
          data={projektwareRows}
          columns={PROJEKTWARE_COLUMNS}
          defaultSort={{ key: 'einkaufsvolumen', dir: 'desc' }}
        />
      )}

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        „Gewinn pro Lieferant" ist die <strong>Handelsmarge auf seiner Ware</strong> —
        nicht der Gewinn der Projekte, in denen er vorkommt. Die beiden Tabellen sind
        verschiedene Qualitäten und werden deshalb nicht addiert:
        {' '}<strong>Katalogware</strong> ist verbaut und verrechnet, die Marge ist
        gefallen. <strong>Projektware</strong> steht in lebenden Offerten — geplant, nicht
        geliefert; gezählt wird je Offert-Entscheidung, eine Variantengruppe also einmal.
        {' '}Einstandspreise stammen aus dem Katalog, nicht aus Lieferantenrechnungen;
        einen Wareneingang mit Preisen gibt es (noch) nicht.
        {geschaetzt > 0 && (
          <>
            {' '}Bei <strong>{geschaetzt}</strong> Positionen liegt kein eingefrorener
            Einkaufspreis vor — dort rechnet die Marge mit dem heutigen Katalog-EK und
            verschiebt sich, wenn jemand den Preis pflegt.
          </>
        )}
      </div>
    </div>
  )
}
