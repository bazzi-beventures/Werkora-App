import { useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiDashboardRow } from '../types'
import KpiCards from '../components/KpiCards'

// null = die View konnte die Summe nicht vollstaendig bilden (Position ohne Preis
// oder Stundensatz, Migration 20260815) — dann „—" statt einer zu niedrigen Zahl.
const chf = (v: number | null | undefined) =>
  typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'

export default function UebersichtTab() {
  const { data, loading, error } = useKpiData<KpiDashboardRow>('vw_kpi_dashboard')

  const row = useMemo(() => data?.[0] ?? null, [data])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!row) return <div className="admin-loading" style={{ color: 'var(--text-muted)' }}>Keine Daten verfügbar</div>

  const pct = row.stunden_veraenderung_pct
  const pctColor = pct > 0 ? 'var(--success)' : pct < 0 ? 'var(--danger)' : 'var(--text-muted)'
  const pctSign = pct > 0 ? '+' : ''

  const cards = [
    { label: 'Mitarbeiter aktiv', value: String(row.mitarbeiter_aktiv), sub: `${row.abwesende_heute} abwesend heute` },
    { label: 'Projekte aktiv', value: String(row.projekte_aktiv), sub: `${row.projekte_abgeschlossen} abgeschlossen` },
    {
      label: 'Stunden (Monat)',
      value: row.stunden_aktueller_monat.toLocaleString('de-CH', { maximumFractionDigits: 0 }),
      sub: `${pctSign}${pct}% vs. Vormonat`,
      subColor: pctColor,
    },
    { label: 'Kosten Verrechn. (Monat)', value: chf(row.kosten_aktueller_monat), sub: `Lohn (Verr.): ${chf(row.lohnkosten_aktueller_monat)}` },
    { label: 'Umsatz (Monat)', value: chf(row.umsatz_aktueller_monat), color: 'var(--success)' },
    {
      label: 'Offene Rechnungen',
      value: String(row.offene_rechnungen_anzahl),
      sub: chf(row.offene_rechnungen_betrag),
      color: row.offene_rechnungen_anzahl > 5 ? 'var(--warning)' : undefined,
    },
    {
      label: 'Lager kritisch',
      value: String(row.lager_kritisch_anzahl),
      color: row.lager_kritisch_anzahl > 0 ? 'var(--danger)' : 'var(--success)',
    },
    {
      label: 'Überstunden (gesamt)',
      value: `${row.ueberstunden_gesamt_stunden.toLocaleString('de-CH')} h`,
      color: row.ueberstunden_gesamt_stunden > 40 ? 'var(--warning)' : undefined,
    },
  ]

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={4} />
    </div>
  )
}
