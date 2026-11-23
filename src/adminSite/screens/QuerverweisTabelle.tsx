import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getKpiView } from '../tenantScopedApi'
import { queryClient } from '../../shared/queryClient'
import { SCREEN_TITLES } from '../../admin/screenTitles'
import type { AdminScreen } from '../../admin/useAdminNav'
import DataTable from '../../admin/kpis/components/DataTable'
import type { ColumnDef } from '../../admin/kpis/types'
import { zeilenAusKlicks, type KlickZeile, type QuerverweisRow } from './querverweisAuswertung'

// Querverweise der Admin-App — Spec docs/specs/querverweis-zaehler.md.
//
// Die Frage hinter der Tabelle: wird ein Verweis zwischen zwei Screens benutzt,
// und wie viel trägt er zu den Ankünften am Ziel bei? «Projekt → Einsatzplanung
// 3 von 210» heisst: die Leute kommen übers Menü, der Verweis ist entbehrlich.
// Ohne Personenbezug — die Tabelle kennt keine Konten.

const WEG_LABEL: Record<string, string> = { link: 'Verweis', menu: 'Menü', hilfe: 'Hilfe-Chat' }

const screenName = (key: string) => SCREEN_TITLES[key as AdminScreen] ?? key
const intnum = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('de-CH') : '—')

const COLUMNS: ColumnDef<KlickZeile>[] = [
  { key: 'von', label: 'Von', format: v => screenName(String(v)) },
  { key: 'nach', label: 'Nach', format: v => screenName(String(v)) },
  { key: 'weg', label: 'Weg', format: v => WEG_LABEL[String(v)] ?? String(v) },
  { key: 'klicks', label: 'Klicks', align: 'right', format: intnum },
  {
    key: 'anteil_ziel_pct',
    label: 'Anteil am Ziel',
    align: 'right',
    format: v => (typeof v === 'number' ? `${v.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %` : '—'),
  },
]

interface Props {
  tenantId: string
  /** Zeitraum-Filter des Nutzungs-Tabs (`and=(datum.gte.…,datum.lte.…)`). */
  filters: Record<string, string>
  rangeLabel: string
}

export default function QuerverweisTabelle({ tenantId, filters, rangeLabel }: Props) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['nutzung', 'querverweise', tenantId, filters],
    queryFn: () => getKpiView<QuerverweisRow>(tenantId, 'querverweis_klicks', filters).then(r => r.rows),
  }, queryClient)

  const zeilen = useMemo(() => zeilenAusKlicks(data ?? []), [data])

  return (
    <>
      <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>
        Querverweise — {rangeLabel}
      </h3>
      <div className="admin-page-subtitle" style={{ marginTop: -4 }}>
        Sprünge zwischen den Screens der Admin-App, nach Weg. «Anteil am Ziel» = Anteil an
        allen gezählten Ankünften auf dem Zielscreen. Gezählt wird seit dem 23.11.2026, ohne
        Personenbezug; Sprünge innerhalb eines Screens (Projekt → Projekt) fehlen.
      </div>
      {isPending && <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>}
      {isError && <div className="admin-error">Querverweise konnten nicht geladen werden.</div>}
      {!isPending && !isError && (
        zeilen.length === 0
          ? <div className="admin-page-subtitle">Im Zeitraum keine Sprünge gezählt.</div>
          : <DataTable data={zeilen} columns={COLUMNS} defaultSort={{ key: 'klicks', dir: 'desc' }} pageSize={40} />
      )}
    </>
  )
}
