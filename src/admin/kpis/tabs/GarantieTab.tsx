// KPI-Tab «Garantie» (docs/specs/garantiefall.md §6.4): wie oft, warum, zu
// welchem Preis. Nach dem Muster von WartungTab — Kacheln, dann Tabellen.
//
// Nur mit Modul «warranty» sichtbar (KpiScreen); die Route prüft dasselbe
// Modul noch einmal (agents/routers/kpi.py, _VIEW_MODULES).

import { useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { ColumnDef, KpiGarantieRow } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import {
  ENTSCHEID_LABEL, STATUS_LABEL, URSACHE_LABEL, garantieKennzahlen, gruppiere,
  nachLieferant, nachUrsache, type GruppenZeile,
} from '../garantieAggregation'

const chf = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return v === null || v === undefined || !Number.isFinite(n)
    ? '—'
    : `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Datum aus den ersten zehn Zeichen: `new Date('2026-03-14')` liest
// UTC-Mitternacht und zeigt westlich von Greenwich den Vortag.
const tag = (v: unknown) => {
  if (typeof v !== 'string' || v.length < 10) return '—'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

const kostenMitHinweis = (_v: unknown, row: GruppenZeile) =>
  row.unvollstaendig > 0 ? `${chf(row.kosten)} (+${row.unvollstaendig} ohne Bewertung)` : chf(row.kosten)

const GRUPPEN_SPALTEN = (titel: string): ColumnDef<GruppenZeile>[] => [
  { key: 'label', label: titel },
  { key: 'faelle', label: 'Fälle', align: 'right' },
  { key: 'kosten', label: 'Kosten (intern)', align: 'right', format: kostenMitHinweis },
]

const FALL_SPALTEN: ColumnDef<KpiGarantieRow>[] = [
  { key: 'case_no', label: 'Fall', format: v => `G-${v}` },
  { key: 'reported_at', label: 'Gemeldet', format: tag },
  { key: 'ursprung_name', label: 'Projekt', format: (v, r) => [r.ursprung_nummer, v].filter(Boolean).join(' ') || '—' },
  { key: 'kunde_name', label: 'Kunde', format: v => (v as string) || '—' },
  { key: 'status', label: 'Status', format: v => STATUS_LABEL[v as KpiGarantieRow['status']] ?? String(v) },
  { key: 'decision', label: 'Entscheid', format: v => (v ? ENTSCHEID_LABEL[v as NonNullable<KpiGarantieRow['decision']>] : '—') },
  { key: 'cause', label: 'Ursache', format: v => (v ? URSACHE_LABEL[v as NonNullable<KpiGarantieRow['cause']>] : '—') },
  { key: 'in_frist', label: 'Frist', format: v => (v === true ? 'in Frist' : v === false ? 'nach Frist' : '—') },
  { key: 'stunden', label: 'Stunden', align: 'right', format: v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('de-CH', { maximumFractionDigits: 1 })) },
  { key: 'kosten', label: 'Kosten (intern)', align: 'right', format: (v, r) => (r.repair_project_id ? chf(v) : '—') },
]

export default function GarantieTab() {
  const { data, loading, error } = useKpiData<KpiGarantieRow>('vw_kpi_garantie')
  const jahr = useMemo(() => new Date().getFullYear(), [])

  const k = useMemo(() => (data ? garantieKennzahlen(data, jahr) : null), [data, jahr])
  const cards = useMemo(() => {
    if (!k) return []
    return [
      { label: 'Offene Fälle', value: String(k.offen), color: k.offen > 0 ? 'var(--warning)' : undefined },
      { label: `Fälle ${jahr}`, value: String(k.faelleJahr) },
      {
        label: `Kosten ${jahr} (intern)`,
        value: chf(k.kostenJahr.summe),
        sub: k.kostenJahr.unvollstaendig > 0 ? `${k.kostenJahr.unvollstaendig} Fall/Fälle ohne Bewertung` : undefined,
        subColor: k.kostenJahr.unvollstaendig > 0 ? 'var(--warning)' : undefined,
      },
      {
        label: `Anteil anerkannt ${jahr}`,
        value: k.anteilAnerkannt === null ? '—' : `${Math.round(k.anteilAnerkannt * 100)} %`,
        sub: k.kulanzJahr > 0 ? `dazu ${k.kulanzJahr} aus Kulanz` : undefined,
      },
    ]
  }, [k, jahr])

  const ursachen = useMemo(() => (data ? gruppiere(data, nachUrsache) : []), [data])
  const lieferanten = useMemo(() => (data ? gruppiere(data, nachLieferant) : []), [data])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!data || data.length === 0) {
    return <div className="admin-empty">Noch keine Garantiefälle. Gemeldet wird im Projekt, Reiter «Garantie».</div>
  }

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={4} />
      <div className="kpi-section-title">Nach Ursache</div>
      <DataTable data={ursachen} columns={GRUPPEN_SPALTEN('Ursache')} defaultSort={{ key: 'faelle', dir: 'desc' }} />
      {lieferanten.length > 0 && (
        <>
          <div className="kpi-section-title">Nach Lieferant (Regress)</div>
          <DataTable data={lieferanten} columns={GRUPPEN_SPALTEN('Lieferant')} defaultSort={{ key: 'faelle', dir: 'desc' }} />
        </>
      )}
      <div className="kpi-section-title">Alle Fälle</div>
      <DataTable data={data} columns={FALL_SPALTEN} defaultSort={{ key: 'reported_at', dir: 'desc' }} />
    </div>
  )
}
