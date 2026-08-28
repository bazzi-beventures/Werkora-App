import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiFinanzenMonatRow, ColumnDef } from '../types'
import { averageOrNull, finite, imMonatsbereich, maxOrZero, percentOrNull, sumOrNull } from '../aggregate'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'

// `finite` statt `typeof v === 'number'`: NaN ist eine Zahl und kam so als
// Text „CHF NaN" durch (siehe aggregate.ts).
const chf = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 0 })}`
}
const num = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : n.toLocaleString('de-CH', { maximumFractionDigits: 1 })
}
const chfSigned = (v: unknown) => {
  const n = finite(v)
  if (n === null) return '—'
  return `${n > 0 ? '+' : ''}CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 0 })}`
}
const pct = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : `${n.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %`
}

const signedColor = (v: number | null) =>
  v === null ? undefined : v >= 0 ? 'var(--success)' : 'var(--danger)'

const COLUMNS: ColumnDef<KpiFinanzenMonatRow>[] = [
  { key: 'jahr_monat', label: 'Monat' },
  { key: 'arbeitsstunden', label: 'Stunden', align: 'right', format: num },
  { key: 'lohnkosten_intern', label: 'Lohn intern', align: 'right', format: chf },
  { key: 'lohnkosten', label: 'Lohn Verrechn.', align: 'right', format: chf },
  { key: 'materialkosten_intern', label: 'Material intern', align: 'right', format: chf },
  { key: 'materialkosten', label: 'Material Verrechn.', align: 'right', format: chf },
  { key: 'total_kosten_intern', label: 'Total intern', align: 'right', format: chf },
  { key: 'umsatz_gestellt', label: 'Umsatz gestellt', align: 'right', format: chf },
  { key: 'rechnungen_bezahlt_betrag', label: 'Umsatz bezahlt', align: 'right', format: chf },
  {
    key: 'gewinn_gestellt',
    label: 'Gewinn',
    align: 'right',
    render: (_v, row) => (
      <span style={{ color: signedColor(row.gewinn_gestellt) }}>{chfSigned(row.gewinn_gestellt)}</span>
    ),
  },
  { key: 'marge_gestellt_pct', label: 'Marge %', align: 'right', format: pct },
  { key: 'offerten_betrag', label: 'Offerten', align: 'right', format: chf },
]

export default function FinanzenTab() {
  const { data, loading, error } = useKpiData<KpiFinanzenMonatRow>('vw_kpi_finanzen_monat')
  const currentYear = new Date().getFullYear()
  const [yearFilter, setYearFilter] = useState<number | null>(null)
  // Eigener Monatsbereich neben den Jahres-Presets (Muster PipelineTab): ein
  // Geschäftsjahr endet nicht immer im Dezember, und „die letzten fünf Monate"
  // liess sich vorher gar nicht eingrenzen. Gesetzt wird jeweils nur, was man
  // ausfüllt — nur „von" heisst „ab diesem Monat".
  const [monatVon, setMonatVon] = useState('')
  const [monatBis, setMonatBis] = useState('')

  const availableYears = useMemo(() => {
    const years = Array.from(new Set((data ?? []).map((r) => r.jahr))).sort((a, b) => b - a)
    return years.slice(0, 3)
  }, [data])

  const yearPresets: { key: number | null; label: string }[] = [
    { key: null, label: 'Alles' },
    ...availableYears.map((y) => ({ key: y, label: String(y) })),
  ]

  // Der Bereich schlägt das Jahres-Preset: wer ein Von/Bis tippt, meint das —
  // sonst käme die stille Schnittmenge aus beidem heraus und man sucht, warum
  // ein Monat fehlt. Das Preset wird beim Setzen des Bereichs auf „Alles"
  // zurückgestellt, damit die Leiste zeigt, was gilt.
  const bereichAktiv = Boolean(monatVon || monatBis)

  const filtered = useMemo(() => {
    let rows = data ?? []
    if (bereichAktiv) {
      return rows.filter((r) => imMonatsbereich(r.jahr_monat, monatVon, monatBis))
    }
    return yearFilter == null ? rows : rows.filter((r) => r.jahr === yearFilter)
  }, [data, yearFilter, monatVon, monatBis, bereichAktiv])

  const chartData = useMemo(
    () =>
      filtered
        .slice()
        .sort((a, b) => a.jahr_monat.localeCompare(b.jahr_monat))
        .map((r) => ({
          name: r.jahr_monat,
          Kosten: finite(r.total_kosten_intern) ?? 0,
          Umsatz: finite(r.umsatz_gestellt) ?? 0,
        })),
    [filtered],
  )

  // Lesereihenfolge einer Erfolgsrechnung: Umsatz, Kosten, Gewinn, Debitoren.
  // Jede Summe über sumOrNull — fehlt ein Monatswert, steht „—" statt einer
  // stillschweigend zu tiefen Zahl (docs/specs/kennzahlen-refactoring.md §3).
  const cards = useMemo(() => {
    if (!filtered.length) return []
    // Ohne jede Eingrenzung zeigen die Karten das laufende Jahr (nicht „alles"),
    // sonst stünde in „Umsatz" die Summe seit Firmengründung. Mit Bereich oder
    // Jahres-Preset gilt genau die Auswahl — die Kachel-Beschriftung sagt welche.
    const ytd = bereichAktiv || yearFilter != null
      ? filtered
      : filtered.filter((r) => r.jahr === currentYear)
    const umsatzGestellt = sumOrNull(ytd, (r) => r.umsatz_gestellt)
    const umsatzBezahlt = sumOrNull(ytd, (r) => r.rechnungen_bezahlt_betrag)
    const kosten = sumOrNull(ytd, (r) => r.total_kosten_intern)
    const gewinnGestellt = sumOrNull(ytd, (r) => r.gewinn_gestellt)
    const gewinnBezahlt = sumOrNull(ytd, (r) => r.gewinn_bezahlt)
    const marge = percentOrNull(gewinnGestellt, umsatzGestellt)
    const avgDebi = averageOrNull(ytd, (r) => r.debitorenlaufzeit_tage)
    const yearLabel = bereichAktiv
      ? [monatVon || 'Beginn', monatBis || 'heute'].join('–')
      : yearFilter != null ? String(yearFilter) : String(currentYear)
    return [
      {
        label: `Umsatz ${yearLabel}`,
        value: chf(umsatzGestellt),
        sub: `bezahlt ${chf(umsatzBezahlt)}`,
        color: 'var(--success)',
      },
      { label: `Kosten ${yearLabel}`, value: chf(kosten), sub: 'Lohn + Material intern' },
      {
        label: `Gewinn ${yearLabel}`,
        value: chfSigned(gewinnGestellt),
        sub: marge === null ? `bezahlt ${chfSigned(gewinnBezahlt)}` : `${pct(marge)} · bezahlt ${chfSigned(gewinnBezahlt)}`,
        color: signedColor(gewinnGestellt),
      },
      { label: 'Ø Debitorenlaufzeit', value: avgDebi === null ? '—' : `${avgDebi.toFixed(0)} Tage` },
    ]
  }, [filtered, yearFilter, currentYear, bereichAktiv, monatVon, monatBis])

  // Datenqualität-Banner: max() pro Monat als untere Schranke (siehe Plan).
  // Bis 20260827b lief das über Spalten, die es nicht mehr gab — Math.max mit
  // undefined ergibt NaN, und NaN > 0 ist false: das Banner konnte nie
  // erscheinen, gerade wenn es gebraucht wurde.
  const dataQuality = useMemo(() => ({
    maxOhneLohn: maxOrZero(filtered, (r) => r.mitarbeiter_ohne_lohn_count),
    maxOhneEk: maxOrZero(filtered, (r) => r.material_ohne_ek_count),
    stundenOhneBezug: sumOrNull(filtered, (r) => r.stunden_ohne_projektbezug) ?? 0,
  }), [filtered])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* Jahres-Presets + eigener Monatsbereich (Muster PipelineTab) */}
      <div className="kpi-date-presets">
        {yearPresets.map((p) => (
          <button
            key={String(p.key)}
            className={`kpi-date-btn${!bereichAktiv && yearFilter === p.key ? ' active' : ''}`}
            onClick={() => { setYearFilter(p.key); setMonatVon(''); setMonatBis('') }}
          >
            {p.label}
          </button>
        ))}
        <input
          type="month"
          className="admin-input"
          style={{ width: 'auto' }}
          value={monatVon}
          onChange={(e) => { setMonatVon(e.target.value); setYearFilter(null) }}
          aria-label="Von Monat"
        />
        <input
          type="month"
          className="admin-input"
          style={{ width: 'auto' }}
          value={monatBis}
          onChange={(e) => { setMonatBis(e.target.value); setYearFilter(null) }}
          aria-label="Bis Monat"
        />
        {bereichAktiv && (
          <button
            className="kpi-date-btn"
            onClick={() => { setMonatVon(''); setMonatBis('') }}
          >
            Bereich löschen
          </button>
        )}
      </div>

      {/* Datenqualität-Banner */}
      {(dataQuality.maxOhneLohn > 0 || dataQuality.maxOhneEk > 0 || dataQuality.stundenOhneBezug > 0) && (
        <div
          style={{
            background: 'var(--warning-soft)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 14px',
            color: 'var(--warning-ink)',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {dataQuality.maxOhneLohn > 0 && (
            <div>
              ⚠ Mind. {dataQuality.maxOhneLohn} Mitarbeiter ohne hinterlegten Monatslohn — interne Lohnkosten unvollständig. Bitte unter <strong>Mitarbeiter</strong> pflegen.
            </div>
          )}
          {dataQuality.maxOhneEk > 0 && (
            <div>
              ⚠ Mind. {dataQuality.maxOhneEk} Materialien ohne EK-Preis — interne Materialkosten unvollständig. Bitte unter <strong>Material / Lager</strong> pflegen.
            </div>
          )}
          {dataQuality.stundenOhneBezug > 0 && (
            <div>
              ℹ {num(dataQuality.stundenOhneBezug)} Stunden sind hier <strong>nicht</strong> enthalten — sie stehen auf archivierten Projekten oder internen Einsätzen (Teamsitzung, Werkstatt, Weiterbildung).
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <KpiCards cards={cards} columns={4} />

      {/* Chart — full width */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Umsatz', label: 'Umsatz (gestellt)' },
          { dataKey: 'Kosten', label: 'Kosten (intern)' },
        ]}
        height={300}
      />

      {/* Table — full width */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'jahr_monat', dir: 'desc' }} />

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        <strong>Gewinn</strong> ist der Deckungsbeitrag: Umsatz minus interne Lohn- und
        Materialkosten. Gemeinkosten (Büro, Fahrzeuge, Miete) sind nicht enthalten.
        <em> Gestellt</em> zählt versendete und bezahlte Rechnungen zum Versanddatum,
        <em> bezahlt</em> nur eingegangenes Geld zum Zahlungsdatum.
        {yearFilter == null && (
          <> Achtung beim Vergleich über die Jahre: bis Juni 2026 wurde <strong>netto</strong> fakturiert,
          seither brutto — ältere Monate liegen dadurch rund 8 % tiefer.</>
        )}
      </div>
    </div>
  )
}
