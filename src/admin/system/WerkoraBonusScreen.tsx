import { useCallback, useEffect, useMemo, useState } from 'react'
import { getWerkoraBonus } from '../../api/admin/werkoraBonus'
import type { WerkoraBonusBeleg, WerkoraBonusResponse } from '../../api/admin/werkoraBonus'
import { useDateRange } from '../kpis/useDateRange'
import DateRangeBar from '../kpis/components/DateRangeBar'
import KpiCards from '../kpis/components/KpiCards'
import DataTable from '../kpis/components/DataTable'
import BiBarChart from '../kpis/components/BiBarChart'
import type { ColumnDef } from '../kpis/types'
import '../kpis/kpi-dashboard.css'

// Werkora-Bonus-Dashboard — Spec docs/specs/werkora-bonus.md §6.
//
// Der Zweck ist NICHT die Kachelreihe, sondern die Belegtabelle darunter: eine
// automatische Preisanpassung ohne Nachweis ist eine Blackbox. Die Frage «warum
// steht auf dieser Offerte 5'588?» muss in zehn Sekunden beantwortbar sein —
// deshalb stehen dort Basis-Brutto, Aufschlag und End-Brutto nebeneinander.
//
// «Werkora Bonus» ist ein INTERNER Name. Auf dem Kundendokument steht die
// konfigurierte Beschriftung (Default «Bearbeitungspauschale»); der Screen zeigt
// sie oben an, damit man beides nicht verwechselt.

const chf = (v: number | null | undefined) =>
  typeof v === 'number'
    ? v.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'

// Kennzahlen ohne Bezugsgrösse kommen als null zurück. Eine 0 zu zeigen behauptete
// eine gemessene Null, wo schlicht nichts zu messen war — deshalb «—».
const pct = (v: number | null | undefined) =>
  typeof v === 'number'
    ? `${v.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %`
    : '—'

const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

/** 'YYYY-MM' → 'Aug 26' (die Achse hat keinen Platz für mehr). */
const fmtMonth = (monat: string) => {
  const [y, m] = monat.split('-')
  const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  const idx = Number(m) - 1
  return names[idx] ? `${names[idx]} ${y?.slice(2) ?? ''}` : monat
}

const STATUS_LABEL: Record<string, string> = {
  offen: 'offen',
  akzeptiert: 'akzeptiert',
  abgelehnt: 'abgelehnt',
  ausstehend: 'gestellt',
  bezahlt: 'bezahlt',
}

const BELEG_COLUMNS: ColumnDef<WerkoraBonusBeleg>[] = [
  {
    key: 'nummer',
    label: 'Beleg',
    render: (_v, row) => (
      <>
        {row.nummer}
        <div className="admin-page-subtitle" style={{ fontSize: 11 }}>
          {row.art === 'offerte' ? 'Offerte' : 'Rechnung'}
        </div>
      </>
    ),
  },
  { key: 'datum', label: 'Datum', format: (_v, row) => fmtDate(row.datum) },
  { key: 'kunde', label: 'Kunde', format: (_v, row) => row.kunde || row.projekt || '—' },
  { key: 'basis_brutto', label: 'Basis (brutto)', align: 'right', format: (_v, row) => chf(row.basis_brutto) },
  { key: 'bonus', label: 'Aufschlag', align: 'right', format: (_v, row) => chf(row.bonus) },
  { key: 'end_brutto', label: 'Total (brutto)', align: 'right', format: (_v, row) => chf(row.end_brutto) },
  { key: 'status', label: 'Status', format: (_v, row) => STATUS_LABEL[row.status] ?? row.status },
]

/** Belegtabelle als CSV — für die Ablage beim Steuerberater bzw. eine eigene Auswertung. */
function toCsv(rows: WerkoraBonusBeleg[]): string {
  const head = ['Art', 'Beleg', 'Datum', 'Kunde', 'Projekt', 'Basis brutto', 'Aufschlag', 'Total brutto', 'Status']
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = rows.map(r => [
    r.art, r.nummer, r.datum, r.kunde, r.projekt,
    r.basis_brutto.toFixed(2), r.bonus.toFixed(2), r.end_brutto.toFixed(2), r.status,
  ].map(esc).join(';'))
  return [head.map(esc).join(';'), ...lines].join('\n')
}

export default function WerkoraBonusScreen() {
  const range = useDateRange('90t')
  const { von, bis } = range
  const [data, setData] = useState<WerkoraBonusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getWerkoraBonus(von, bis))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [von, bis])

  useEffect(() => { void load() }, [load])

  const cards = useMemo(() => {
    const k = data?.kennzahlen
    return [
      {
        label: 'Bonus realisiert',
        value: `CHF ${chf(k?.realisiert ?? 0)}`,
        sub: `davon bezahlt: CHF ${chf(k?.bezahlt ?? 0)}`,
      },
      {
        label: 'Bonus offeriert (offen)',
        value: `CHF ${chf(k?.offeriert_offen ?? 0)}`,
        sub: 'noch nicht entschiedene Offerten',
      },
      {
        label: 'Ø pro Beleg',
        value: k?.durchschnitt_pro_beleg != null ? `CHF ${chf(k.durchschnitt_pro_beleg)}` : '—',
        sub: `${k?.belege_mit_bonus ?? 0} verrechnete Belege mit Aufschlag`,
      },
      {
        label: 'Trefferquote',
        value: pct(k?.trefferquote_pct),
        // Eine tiefe Quote heisst fast immer «viele Fixpreis-Offerten», nicht
        // «die Automatik ist kaputt» — ohne diesen Hinweis liest man sie falsch.
        sub: data?.konfiguration.schwelle_chf != null
          ? `Offerten über CHF ${chf(data.konfiguration.schwelle_chf)}`
          : 'keine Schwelle konfiguriert',
      },
      {
        label: 'Anteil am Netto-Umsatz',
        value: pct(k?.anteil_netto_umsatz_pct),
        sub: `Basis: CHF ${chf(k?.netto_umsatz ?? 0)}`,
      },
    ]
  }, [data])

  const chartData = useMemo(
    () => (data?.monate ?? []).map(m => ({
      name: fmtMonth(m.monat),
      Offeriert: m.offeriert,
      Realisiert: m.realisiert,
    })),
    [data],
  )

  const belege = data?.belege ?? []

  function downloadCsv() {
    // BOM voran: ohne ihn zeigt Excel die Umlaute der Kundennamen als Mojibake.
    const blob = new Blob(['\uFEFF' + toCsv(belege)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `werkora-bonus_${von}_${bis}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Werkora Bonus</div>
          <div className="admin-page-subtitle">
            Zusatzmarge aus der automatischen Endziffern-Aufrundung — offeriert und realisiert
          </div>
        </div>
        {belege.length > 0 && (
          <button className="admin-btn admin-btn-secondary" onClick={downloadCsv}>
            CSV export
          </button>
        )}
      </div>

      <DateRangeBar range={range} />

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>}
      {error && !loading && <div className="admin-error">{error}</div>}

      {!loading && !error && data && (
        <div className="kpi-bi-layout">
          {!data.aktiv && (
            <div className="admin-page-subtitle">
              Das Feature <strong>Werkora Bonus</strong> ist bei diesem Mandanten
              nicht aktiv (oder die Parameter sind unbrauchbar). Es wird kein neuer
              Aufschlag berechnet — die Zahlen unten sind der Bestand aus der Zeit,
              in der es lief. Einschalten unter <strong>Konfiguration → Workflows →
              Offerte</strong>.
            </div>
          )}

          <KpiCards cards={cards} columns={5} />

          <div className="admin-page-subtitle" style={{ marginTop: -4 }}>
            «Realisiert» zählt die im Zeitraum <strong>versendeten</strong> Rechnungen,
            «offeriert» die noch offenen Offerten — keine Doppelzählung: eine Rechnung
            aus einer Offerte übernimmt deren Aufschlag, sie schlägt nichts erneut auf.
            {data.konfiguration.position_label && (
              <> Auf dem Kundendokument erscheint der Aufschlag als{' '}
              <strong>«{data.konfiguration.position_label}»</strong>; «Werkora Bonus»
              steht dort nie.</>
            )}
          </div>

          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[
              { dataKey: 'Offeriert', color: '#94a3b8', label: 'Offeriert' },
              { dataKey: 'Realisiert', color: '#3081AB', label: 'Realisiert' },
            ]}
            height={260}
          />

          <h3 className="kpi-bi-section-title">
            Einzelne Aufschläge — {range.label}
          </h3>
          {belege.length === 0 ? (
            <div className="admin-page-subtitle">
              Kein Beleg im Zeitraum trägt einen Aufschlag.
            </div>
          ) : (
            <DataTable
              data={belege}
              columns={BELEG_COLUMNS}
              defaultSort={{ key: 'datum', dir: 'desc' }}
              pageSize={40}
            />
          )}
        </div>
      )}
    </div>
  )
}
