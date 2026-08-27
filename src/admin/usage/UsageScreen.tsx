import { useMemo } from 'react'
import { useKpiData } from '../kpis/useKpiData'
import { useDateRange } from '../hooks/useDateRange'
import { tickDM } from '../components/dateRange'
import DateRangeBar from '../components/DateRangeBar'
import KpiCards from '../kpis/components/KpiCards'
import DataTable from '../kpis/components/DataTable'
import BiBarChart from '../kpis/components/BiBarChart'
import type { ColumnDef, KpiNutzungAdoptionRow, KpiNutzungAktionRow } from '../kpis/types'
import {
  UNMAPPED, actionLabel, coverageNote, isPseudoModule, moduleCoverage, moduleLabel, moduleOfAction,
} from '../constants/usageTaxonomy'
import type { Coverage } from '../constants/usageTaxonomy'
import '../kpis/kpi-dashboard.css'
import './usage.css'

// Nutzungs-Dashboard — Spec docs/specs/nutzungs-dashboard.md.
//
// Zwei Fragen, mehr nicht: welche Module laufen leer, und wer ist beim Rollout
// nie angekommen. Was hier BEWUSST fehlt, ist eine Aktivitätskurve pro Person
// (Spec §3.3): ArGV 3 Art. 26 verbietet Systeme zur Verhaltensüberwachung am
// Arbeitsplatz. Die Zeitreihe zählt deshalb Aktionen, nie Personen über die
// Zeit, und die Adoptions-Tabelle enthält keine Aktionszahl pro Kopf.

// audit_log gibt es erst seit dieser Migration; davor ist leer und bleibt leer.
// Ohne den Hinweis liest man fehlende Daten als "keine Nutzung".
const AUDIT_START = '20.03.2026'

const intnum = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('de-CH') : '—')
const pctCell = (v: unknown) =>
  typeof v === 'number' ? `${v.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %` : '—'

const fmtDateTime = (iso: string | null) => {
  if (!iso) return 'nie'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// "nie eingeloggt" muss beim Sortieren ganz oben landen — das ist die Zeile,
// wegen der man die Tabelle aufmacht. Als `null` sortiert DataTable sie über
// `?? ''` als leeren String und damit ans ENDE. Deshalb ein echter Zahlenwert,
// der grösser ist als jede Anzahl Tage, und ein '—' in der Anzeige.
const NIE = Number.MAX_SAFE_INTEGER

const daysSince = (iso: string | null): number => {
  if (!iso) return NIE
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isNaN(ms) ? NIE : Math.floor(ms / 86_400_000)
}

// ── Tabellen-Zeilen ────────────────────────────────────────────

interface ModulRow {
  modul: string
  name: string
  aktiv: boolean
  /** Sammeltopf (Grundfunktionen, Rapporte …): nicht schaltbar, zählt nicht in
   *  die Kachel "Genutzte Module". */
  pseudo: boolean
  aktionen: number
  anteil_pct: number
  /** Wie weit audit_log dieses Modul abdeckt. `keine` heisst: 0 ist hier keine
   *  Aussage, sondern eine Lücke — siehe moduleCoverage(). */
  coverage: Coverage
  /** Erläuterung bei Teilabdeckung, sonst undefined. */
  note?: string
  /** 0 = messbar, aktiv und trotzdem ungenutzt (der Befund, wegen dem man die
   *  Tabelle aufmacht), 1 = normal, 2 = gar nicht protokolliert (trägt keine
   *  Information und gehört deshalb nach unten). DataTable sortiert selbst;
   *  weil Array.sort stabil ist, bleibt innerhalb einer Stufe die Reihenfolge
   *  nach Aktionen erhalten. */
  prio: number
}

interface AktionRow {
  name: string
  modul: string
  aktionen: number
}

interface AdoptionRow {
  benutzer_name: string
  rolle: string
  status: string
  zuletzt: string
  /** Tage seit dem letzten Besuch; NIE, wenn noch nie eingeloggt. */
  tage: number
  konto_erstellt: string
}

const MODUL_COLUMNS: ColumnDef<ModulRow>[] = [
  {
    key: 'name',
    label: 'Modul',
    render: (_v, row) => (
      <>
        {row.name}
        {row.note && <div className="usage-note">{row.note}</div>}
      </>
    ),
  },
  {
    key: 'aktiv',
    label: 'Status',
    render: (_v, row) => {
      // Sammeltöpfe kann niemand abschalten — "nicht aktiv" wäre schlicht falsch.
      if (row.pseudo) return <span className="usage-muted">immer aktiv</span>
      if (!row.aktiv) return <span className="usage-muted">nicht aktiv</span>
      // Eingeschaltet, aber es führt kein Weg in den Audit-Trail. Ohne diesen
      // Hinweis stünde daneben "0 — ungenutzt" und behauptete etwas, das die
      // Datenlage nicht hergibt.
      if (row.coverage === 'keine') return <span className="usage-muted">aktiv · nicht protokolliert</span>
      if (row.coverage === 'teilweise') return <span className="usage-muted">aktiv · teilweise erfasst</span>
      return 'aktiv'
    },
  },
  {
    key: 'aktionen',
    label: 'Aktionen',
    align: 'right',
    render: (_v, row) => {
      // Kein Messwert, also keine Zahl: eine 0 hier wäre eine Behauptung.
      if (!row.pseudo && row.coverage === 'keine') return <span className="usage-muted">—</span>
      return !row.pseudo && row.aktiv && row.aktionen === 0
        ? <span className="usage-dead">0 — ungenutzt</span>
        : intnum(row.aktionen)
    },
  },
  {
    key: 'anteil_pct',
    label: 'Anteil',
    align: 'right',
    render: (_v, row) =>
      !row.pseudo && row.coverage === 'keine'
        ? <span className="usage-muted">—</span>
        : pctCell(row.anteil_pct),
  },
]

const AKTION_COLUMNS: ColumnDef<AktionRow>[] = [
  { key: 'name', label: 'Aktion' },
  { key: 'modul', label: 'Modul' },
  { key: 'aktionen', label: 'Anzahl', align: 'right', format: intnum },
]

const ADOPTION_COLUMNS: ColumnDef<AdoptionRow>[] = [
  { key: 'benutzer_name', label: 'Benutzer' },
  { key: 'rolle', label: 'Rolle' },
  { key: 'status', label: 'Konto' },
  {
    key: 'zuletzt',
    label: 'Zuletzt gesehen',
    render: (_v, row) =>
      row.zuletzt === 'nie'
        ? <span className="usage-dead">nie</span>
        : row.zuletzt,
  },
  {
    key: 'tage',
    label: 'vor Tagen',
    align: 'right',
    render: (_v, row) => (row.tage === NIE ? '—' : intnum(row.tage)),
  },
  { key: 'konto_erstellt', label: 'Konto seit' },
]

interface Props {
  /** Module dieses Mandanten — aus user.enabled_modules, NICHT aus dem TS-Typ
   *  ModuleName: der kennt nur 19 der 25 Module (Spec §7f). */
  enabledModules: string[]
}

export default function UsageScreen({ enabledModules }: Props) {
  const range = useDateRange('30t')
  const { filters } = range

  const aktion = useKpiData<KpiNutzungAktionRow>('vw_kpi_nutzung_aktion', filters)
  const adoption = useKpiData<KpiNutzungAdoptionRow>('vw_kpi_nutzung_adoption')

  const rows = useMemo(() => aktion.data ?? [], [aktion.data])
  const konten = useMemo(() => adoption.data ?? [], [adoption.data])

  const loading = aktion.loading || adoption.loading
  const error = aktion.error || adoption.error

  // ── Aktionen je Modul ──
  const aktionenProModul = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const mod = moduleOfAction(r.action)
      m.set(mod, (m.get(mod) ?? 0) + r.aktionen)
    }
    return m
  }, [rows])

  const totalAktionen = useMemo(
    () => rows.reduce((s, r) => s + r.aktionen, 0),
    [rows],
  )

  // ── Modul-Inventar: eingeschaltet × benutzt ──
  // Vereinigung aus "beim Mandanten aktiv" und "kam im Zeitraum vor". Der
  // zweite Teil fängt Aktionen zu Modulen ab, die inzwischen abgeschaltet
  // wurden — die sollen nicht stillschweigend aus der Summe fallen.
  const modulRows = useMemo<ModulRow[]>(() => {
    const keys = new Set<string>([...enabledModules, ...aktionenProModul.keys()])
    const out: ModulRow[] = []
    for (const key of keys) {
      const aktionen = aktionenProModul.get(key) ?? 0
      const pseudo = isPseudoModule(key)
      const aktiv = enabledModules.includes(key)
      const coverage = pseudo ? 'voll' : moduleCoverage(key)
      out.push({
        modul: key,
        name: moduleLabel(key),
        aktiv,
        pseudo,
        aktionen,
        anteil_pct: totalAktionen > 0 ? (aktionen / totalAktionen) * 100 : 0,
        coverage,
        note: coverageNote(key),
        prio: coverage === 'keine' ? 2 : (!pseudo && aktiv && aktionen === 0 ? 0 : 1),
      })
    }
    return out.sort((a, b) => b.aktionen - a.aktionen)
  }, [enabledModules, aktionenProModul, totalAktionen])

  // Gezählt wird gegen die MESSBAREN Module, nicht gegen alle aktiven. Sonst
  // steht dauerhaft eine rote Kachel da, die zu neun Zehnteln aus Push- und
  // Hintergrundmodulen besteht, welche per Bauart nie eine Aktion schreiben —
  // und der eine echte Befund darunter (ein eingeschaltetes, aber wirklich
  // ungenutztes Modul) geht darin unter.
  const messbareModule = modulRows.filter(r => !r.pseudo && r.aktiv && r.coverage !== 'keine')
  const genutzteModule = messbareModule.filter(r => r.aktionen > 0).length
  const toteModule = messbareModule.length - genutzteModule
  const nichtProtokolliert = modulRows.filter(r => !r.pseudo && r.aktiv && r.coverage === 'keine').length

  // ── Kacheln ──
  // "Aktive Benutzer" ist das TAGES-Maximum, nicht die Summe: Tageswerte sind
  // COUNT(DISTINCT) und lassen sich nicht addieren, ohne Personen doppelt zu
  // zählen. Das Maximum ist die ehrlichste Zahl, die aus Tagesaggregaten
  // herauszuholen ist.
  const maxBenutzerProTag = useMemo(() => {
    const proTag = new Map<string, number>()
    for (const r of rows) proTag.set(r.datum, Math.max(proTag.get(r.datum) ?? 0, r.benutzer))
    return proTag.size ? Math.max(...proTag.values()) : 0
  }, [rows])

  // Nur AKTIVE Konten: ein deaktiviertes Konto ohne Aktivität ist kein Befund,
  // sondern der Normalfall — es würde die Zahl nur verwässern.
  const aktiveKonten = useMemo(() => konten.filter(k => k.is_active !== false), [konten])

  const ohneAktivitaet = useMemo(() => {
    const grenze = new Date(range.von).getTime()
    return aktiveKonten.filter(k => {
      if (!k.zuletzt_gesehen) return true
      const t = new Date(k.zuletzt_gesehen).getTime()
      return Number.isNaN(t) || t < grenze
    }).length
  }, [aktiveKonten, range.von])

  const cards = useMemo(() => [
    {
      label: 'Genutzte Module',
      value: `${genutzteModule} / ${messbareModule.length}`,
      color: toteModule > 0 ? '#be123c' : undefined,
      sub: [
        toteModule > 0 ? `${toteModule} aktiv, aber ungenutzt` : 'alle messbaren im Einsatz',
        nichtProtokolliert > 0 ? `${nichtProtokolliert} nicht protokolliert` : '',
      ].filter(Boolean).join(' · '),
    },
    { label: 'Aktionen', value: intnum(totalAktionen), sub: range.label },
    { label: 'Aktive Benutzer (max./Tag)', value: intnum(maxBenutzerProTag) },
    {
      label: 'Konten ohne Aktivität',
      value: `${ohneAktivitaet} / ${aktiveKonten.length}`,
      color: ohneAktivitaet > 0 ? '#be123c' : undefined,
      sub: 'aktive Konten im Zeitraum',
    },
  ], [genutzteModule, messbareModule.length, toteModule, nichtProtokolliert,
      totalAktionen, range.label, maxBenutzerProTag, ohneAktivitaet, aktiveKonten.length])

  // ── Tagesbalken: Aktionen, ohne Personenbezug ──
  const chartData = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.datum, (m.get(r.datum) ?? 0) + r.aktionen)
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([datum, aktionen]) => ({ name: datum, Aktionen: aktionen }))
  }, [rows])

  // ── Aktions-Tabelle ──
  const aktionRows = useMemo<AktionRow[]>(() => {
    const m = new Map<string, AktionRow>()
    for (const r of rows) {
      const cur = m.get(r.action) ?? {
        name: actionLabel(r.action),
        modul: moduleLabel(moduleOfAction(r.action)),
        aktionen: 0,
      }
      cur.aktionen += r.aktionen
      m.set(r.action, cur)
    }
    return Array.from(m.values()).sort((a, b) => b.aktionen - a.aktionen)
  }, [rows])

  // ── Adoptions-Tabelle ──
  const adoptionRows = useMemo<AdoptionRow[]>(() =>
    konten.map(k => ({
      benutzer_name: k.benutzer_name,
      rolle: k.rolle ?? '—',
      status: k.is_active === false ? 'deaktiviert' : 'aktiv',
      zuletzt: fmtDateTime(k.zuletzt_gesehen),
      tage: daysSince(k.zuletzt_gesehen),
      konto_erstellt: fmtDateTime(k.konto_erstellt),
    })),
  [konten])

  const nichtZugeordnet = aktionenProModul.get(UNMAPPED) ?? 0

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Nutzung</div>
          <div className="admin-page-subtitle">
            Welche Module laufen leer, wer ist nie angekommen — live aus audit_log
          </div>
        </div>
      </div>

      <DateRangeBar range={range} />

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>}
      {error && !loading && <div className="admin-error">{error}</div>}

      {!loading && !error && (
        <div className="kpi-bi-layout">
          <KpiCards cards={cards} columns={4} />

          <div className="admin-page-subtitle" style={{ marginTop: -4 }}>
            Gezählt werden protokollierte <strong>Änderungen</strong>, kein Blättern und
            kein Lesen — ein Modul ohne Aktionen kann also angeschaut worden sein.
            Aktionsprotokoll erst ab {AUDIT_START}; frühere Zeiträume sind leer, nicht
            ungenutzt.
            {nichtProtokolliert > 0 && (
              <> <strong>{intnum(nichtProtokolliert)}</strong> aktive Module schreiben gar
              nicht ins Protokoll (Push, Erinnerungen, KI, Hilfe-Bot) — sie stehen unten
              als «nicht protokolliert» und zählen nicht als ungenutzt.</>
            )}{' '}
            Tipp: Auf einen Tagesbalken klicken zoomt auf diesen Tag.
            {nichtZugeordnet > 0 && (
              <> · <strong>{intnum(nichtZugeordnet)}</strong> Aktionen ohne Modul-Zuordnung —
              Regel in <code>usageTaxonomy.ts</code> ergänzen.</>
            )}
          </div>

          <BiBarChart
            data={chartData}
            xKey="name"
            bars={[{ dataKey: 'Aktionen', label: 'Aktionen' }]}
            height={280}
            onBarClick={range.drillToDay}
            xInterval="preserveStartEnd"
            xTickFormatter={tickDM}
          />

          <h3 className="kpi-bi-section-title">Modul-Inventar — {range.label}</h3>
          <DataTable
            data={modulRows}
            columns={MODUL_COLUMNS}
            defaultSort={{ key: 'prio', dir: 'asc' }}
            pageSize={40}
          />

          <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>
            Adoption — {konten.length} Konten
          </h3>
          <DataTable
            data={adoptionRows}
            columns={ADOPTION_COLUMNS}
            defaultSort={{ key: 'tage', dir: 'desc' }}
            pageSize={40}
          />

          <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>
            Nach Aktion — {range.label}
          </h3>
          <DataTable
            data={aktionRows}
            columns={AKTION_COLUMNS}
            defaultSort={{ key: 'aktionen', dir: 'desc' }}
          />
        </div>
      )}
    </div>
  )
}
