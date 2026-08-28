import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { ColumnDef, KpiFunktionMonatRow } from '../types'
import { aggregiereFunktionen, verfuegbareMonate } from '../funktionAggregation'
import type { FunktionSumme } from '../funktionAggregation'
import { finite, percentOrNull, sumOrNull } from '../aggregate'
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

const COLUMNS: ColumnDef<FunktionSumme>[] = [
  { key: 'funktion', label: 'Funktion' },
  { key: 'anzahl_mitarbeiter', label: 'Personen', align: 'right' },
  { key: 'stunden', label: 'Stunden', align: 'right', format: num },
  { key: 'verrechnet_chf', label: 'Verrechnet', align: 'right', format: chf },
  { key: 'lohnkosten_intern', label: 'Eigenkosten', align: 'right', format: chf },
  {
    key: 'deckungsbeitrag',
    label: 'Deckungsbeitrag',
    align: 'right',
    render: (_v, row) => (
      <span style={{ color: signedColor(row.deckungsbeitrag) }}>{chfSigned(row.deckungsbeitrag)}</span>
    ),
  },
  {
    key: 'db_pro_stunde',
    label: 'DB / Stunde',
    align: 'right',
    render: (_v, row) => (
      <span style={{ color: signedColor(row.db_pro_stunde) }}>{chfSigned(row.db_pro_stunde)}</span>
    ),
  },
  { key: 'marge_pct', label: 'Marge %', align: 'right', format: pct },
  { key: 'monate', label: 'Monate', align: 'right' },
]

export default function DeckungsbeitragTab() {
  const { data, loading, error } = useKpiData<KpiFunktionMonatRow>('vw_kpi_funktion_monat')
  const [monatVon, setMonatVon] = useState('')
  const [monatBis, setMonatBis] = useState('')

  const monate = useMemo(() => verfuegbareMonate(data ?? []), [data])
  const funktionen = useMemo(
    () => aggregiereFunktionen(data ?? [], monatVon, monatBis),
    [data, monatVon, monatBis],
  )

  const cards = useMemo(() => {
    if (!funktionen.length) return []
    const stunden = sumOrNull(funktionen, (f) => f.stunden)
    const verrechnet = sumOrNull(funktionen, (f) => f.verrechnet_chf)
    const kosten = sumOrNull(funktionen, (f) => f.lohnkosten_intern)
    const db = verrechnet === null || kosten === null ? null : verrechnet - kosten
    const marge = percentOrNull(db, verrechnet)
    const proStunde = db === null || !stunden ? null : db / stunden
    // Schwächste Funktion nach DB je Stunde — die Satzfrage, nicht die Personenfrage.
    const bewertbar = funktionen.filter((f) => f.db_pro_stunde !== null)
    const schwaechste = bewertbar.length
      ? bewertbar.reduce((min, f) => ((f.db_pro_stunde ?? 0) < (min.db_pro_stunde ?? 0) ? f : min))
      : null
    return [
      { label: 'Stunden', value: num(stunden), sub: `${funktionen.length} Funktionen` },
      { label: 'Verrechnet', value: chf(verrechnet) },
      {
        label: 'Deckungsbeitrag',
        value: chfSigned(db),
        sub: marge === null ? 'Verrechnet − Eigenkosten' : `${pct(marge)} Marge`,
        color: signedColor(db),
      },
      { label: 'DB je Stunde', value: chfSigned(proStunde), color: signedColor(proStunde) },
      {
        label: 'Tiefster Satzbeitrag',
        value: schwaechste ? schwaechste.funktion : '—',
        sub: schwaechste ? `${chfSigned(schwaechste.db_pro_stunde)} / Std` : undefined,
        subColor: schwaechste ? signedColor(schwaechste.db_pro_stunde) : undefined,
      },
    ]
  }, [funktionen])

  const chartData = useMemo(
    () =>
      funktionen
        .filter((f) => f.verrechnet_chf !== null || f.lohnkosten_intern !== null)
        .slice(0, 12)
        .map((f) => ({
          name: f.funktion.slice(0, 18),
          Verrechnet: f.verrechnet_chf,
          Eigenkosten: f.lohnkosten_intern,
        })),
    [funktionen],
  )

  const einzelbesetzt = useMemo(
    () => funktionen.filter((f) => f.anzahl_mitarbeiter === 1).length,
    [funktionen],
  )
  const unvollstaendig = useMemo(
    () => funktionen.filter((f) => f.stunden_ohne_satz > 0 || f.stunden_ohne_lohn > 0).length,
    [funktionen],
  )

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={5} />

      <div className="kpi-filter-bar">
        {/* Gleiche Bedienung wie im Finanzen-Tab: zwei Monatsfelder, offene
            Grenzen erlaubt. Ein Geschäftsjahr endet nicht immer im Dezember. */}
        <input
          type="month"
          className="admin-input"
          style={{ width: 'auto' }}
          value={monatVon}
          onChange={(e) => setMonatVon(e.target.value)}
          aria-label="Von Monat"
        />
        <input
          type="month"
          className="admin-input"
          style={{ width: 'auto' }}
          value={monatBis}
          onChange={(e) => setMonatBis(e.target.value)}
          aria-label="Bis Monat"
        />
        {(monatVon || monatBis) && (
          <button
            type="button"
            className="kpi-date-btn"
            onClick={() => { setMonatVon(''); setMonatBis('') }}
          >
            Bereich löschen
          </button>
        )}
        <span className="kpi-filter-count">
          {monate.length ? `${monate.length} Monate erfasst` : 'keine Daten'}
        </span>
      </div>

      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Verrechnet', label: 'Verrechnet' },
          { dataKey: 'Eigenkosten', label: 'Eigenkosten' },
        ]}
        height={300}
      />

      <DataTable data={funktionen} columns={COLUMNS} defaultSort={{ key: 'deckungsbeitrag', dir: 'desc' }} />

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Diese Sicht beantwortet eine <strong>Kalkulationsfrage</strong>: trägt der
        Stundensatz einer Funktion ihre Kosten? Sie ist bewusst <strong>keine
        Leistungsbeurteilung</strong> — deshalb steht hier die Funktion und nicht die
        Person. Ein tiefer Wert ist zuerst eine Satz- oder Einsatzplanungsfrage: wer
        viel in der Werkstatt arbeitet, verrechnet zum tieferen Werkstatt-Tarif.
        {einzelbesetzt > 0 && (
          <>
            {' '}<strong>{einzelbesetzt}</strong>{' '}
            {einzelbesetzt === 1 ? 'Funktion wird' : 'Funktionen werden'} im Zeitraum von
            genau einer Person getragen — dort ist die Zeile faktisch deren Zahl.
          </>
        )}
        {' '}Gezählt werden nur Stunden auf bewerteten Projekten; interne Einsätze
        (Teamsitzung, Werkstatt-Blocker) haben keinen Kunden und würden jede Funktion
        unterdeckt aussehen lassen.
        {unvollstaendig > 0 && (
          <>
            {' '}Bei <strong>{unvollstaendig}</strong>{' '}
            {unvollstaendig === 1 ? 'Funktion' : 'Funktionen'} fehlt ein Stundensatz oder
            ein Monatslohn — dort steht „—" statt einer geschönten Zahl.
          </>
        )}
      </div>
    </div>
  )
}
