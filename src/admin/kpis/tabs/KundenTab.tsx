import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiKundeRow, ColumnDef } from '../types'
import { finite, matchesSuche, percentOrNull, sumOrNull } from '../aggregate'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import MultiDropdown from '../components/MultiDropdown'

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

/** Drei Klassen für den Gewinn-Filter. „unbekannt" ist eine eigene Klasse und
 *  keine Null: der Kunde hat ein Projekt ohne hinterlegte Kosten. */
function gewinnKlasse(row: KpiKundeRow): string {
  const g = finite(row.gewinn_gestellt)
  if (g === null) return 'unbekannt'
  return g >= 0 ? 'positiv' : 'negativ'
}

const COLUMNS: ColumnDef<KpiKundeRow>[] = [
  { key: 'kunde_name', label: 'Kunde' },
  { key: 'projekte_anzahl', label: 'Projekte', align: 'right' },
  { key: 'projekte_offen', label: 'davon offen', align: 'right' },
  { key: 'total_arbeitsstunden', label: 'Stunden', align: 'right', format: num },
  { key: 'umsatz_gestellt', label: 'Umsatz gestellt', align: 'right', format: chf },
  { key: 'umsatz_bezahlt', label: 'davon bezahlt', align: 'right', format: chf },
  { key: 'kosten_intern', label: 'Eigenkosten', align: 'right', format: chf },
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
  { key: 'offerten_anzahl', label: 'Offerten', align: 'right' },
  { key: 'annahmequote_pct', label: 'Annahme %', align: 'right', format: pct },
  { key: 'mahnungen_anzahl', label: 'Mahnungen', align: 'right' },
  { key: 'letzte_aktivitaet', label: 'Letzte Aktivität' },
]

export default function KundenTab() {
  const { data, loading, error } = useKpiData<KpiKundeRow>('vw_kpi_kunde')
  const [suche, setSuche] = useState('')
  // Archivierte Kunden sind standardmässig aus — wie in der Kundenliste
  // (Entscheid 2026-08-27). Die View liefert sie trotzdem: ihre Historie soll
  // sich einschalten lassen, ohne dass jemand eine Migration braucht.
  const [zeigeArchivierte, setZeigeArchivierte] = useState(false)
  const [gewinnSel, setGewinnSel] = useState<Set<string>>(new Set(['positiv', 'negativ', 'unbekannt']))

  const archivierteAnzahl = useMemo(
    () => data?.filter((r) => r.ist_archiviert).length ?? 0,
    [data],
  )

  const gewinnOptions = useMemo(() => {
    const sichtbar = (data ?? []).filter((r) => zeigeArchivierte || !r.ist_archiviert)
    return ['positiv', 'negativ', 'unbekannt'].map((value) => ({
      value,
      count: sichtbar.filter((r) => gewinnKlasse(r) === value).length,
    }))
  }, [data, zeigeArchivierte])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((r) => {
      if (!zeigeArchivierte && r.ist_archiviert) return false
      if (!gewinnSel.has(gewinnKlasse(r))) return false
      if (!matchesSuche(suche, [r.kunde_name, r.kunde_email])) return false
      return true
    })
  }, [data, zeigeArchivierte, gewinnSel, suche])

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const umsatz = sumOrNull(filtered, (r) => r.umsatz_gestellt)
    const gewinn = sumOrNull(filtered, (r) => r.gewinn_gestellt)
    const marge = percentOrNull(gewinn, umsatz)
    const mitGewinn = filtered.filter((r) => finite(r.gewinn_gestellt) !== null)
    const top = mitGewinn.length
      ? mitGewinn.reduce((best, r) => ((r.gewinn_gestellt ?? 0) > (best.gewinn_gestellt ?? 0) ? r : best))
      : null
    const offen = filtered.reduce((s, r) => s + r.rechnungen_offen, 0)
    return [
      { label: 'Kunden', value: String(filtered.length), sub: `${filtered.reduce((s, r) => s + r.projekte_anzahl, 0)} Projekte` },
      { label: 'Umsatz gestellt', value: chf(umsatz) },
      {
        label: 'Gewinn',
        value: chfSigned(gewinn),
        sub: marge === null ? 'Umsatz − Eigenkosten' : `${pct(marge)} Marge`,
        color: signedColor(gewinn),
      },
      {
        label: 'Bester Kunde',
        value: top ? top.kunde_name : '—',
        sub: top ? chfSigned(top.gewinn_gestellt) : undefined,
      },
      { label: 'Offene Rechnungen', value: String(offen), sub: 'noch nicht bezahlt' },
    ]
  }, [filtered])

  const chartData = useMemo(
    () =>
      filtered
        .filter((r) => finite(r.gewinn_gestellt) !== null)
        .sort((a, b) => (b.gewinn_gestellt ?? 0) - (a.gewinn_gestellt ?? 0))
        .slice(0, 12)
        .map((r) => ({
          name: r.kunde_name.slice(0, 18),
          Umsatz: r.umsatz_gestellt,
          Gewinn: r.gewinn_gestellt,
        })),
    [filtered],
  )

  const unvollstaendig = useMemo(
    () => filtered.filter((r) => r.projekte_ohne_kosten > 0).length,
    [filtered],
  )

  function toggleGewinn(v: string) {
    setGewinnSel((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={5} />

      <div className="kpi-filter-bar">
        <MultiDropdown
          label="Gewinn"
          options={gewinnOptions}
          selected={gewinnSel}
          onToggle={toggleGewinn}
          onToggleAll={(all) =>
            setGewinnSel(all ? new Set(['positiv', 'negativ', 'unbekannt']) : new Set())
          }
        />
        <input
          className="kpi-filter-search"
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Kunde oder E-Mail…"
          aria-label="Kunden durchsuchen"
        />
        {archivierteAnzahl > 0 && (
          <label className="kpi-filter-toggle">
            <input
              type="checkbox"
              checked={zeigeArchivierte}
              onChange={(e) => setZeigeArchivierte(e.target.checked)}
            />
            {`Archivierte zeigen (${archivierteAnzahl})`}
          </label>
        )}
        <span className="kpi-filter-count">{filtered.length} Kunden</span>
      </div>

      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Umsatz', label: 'Umsatz gestellt' },
          { dataKey: 'Gewinn', label: 'Gewinn' },
        ]}
        height={300}
      />

      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'gewinn_gestellt', dir: 'desc' }} />

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        <strong>Gewinn</strong> ist die Summe der Projektgewinne dieses Kunden:
        gestellter Umsatz minus interne Lohn- und Materialkosten, ohne Gemeinkosten.
        {unvollstaendig > 0 && (
          <>
            {' '}Bei <strong>{unvollstaendig}</strong>{' '}
            {unvollstaendig === 1 ? 'Kunden' : 'Kunden'} fehlt mindestens einem Projekt
            der Monatslohn oder der Einkaufspreis — dort steht „—" statt einer zu
            günstig gerechneten Summe.
          </>
        )}
        {' '}<strong>Offerten</strong> zählt Entscheidungen, nicht Dokumente: eine
        Variantengruppe (Option A/B/C) ist eine Chance, nicht drei. Die Annahmequote
        rechnet gegen die <em>entschiedenen</em> Offerten; offene sind nicht im Nenner.
        {' '}Archivierte Projekte und interne Einsätze zählen nirgends mit.
        {' '}Projekte ohne Kundenzuordnung stehen als eigene Zeile
        „ohne Kundenzuordnung" — sichtbar statt still verteilt.
      </div>
    </div>
  )
}
