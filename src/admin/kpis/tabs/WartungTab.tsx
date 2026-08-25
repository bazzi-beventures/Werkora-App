import { useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiWartungRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'

const STATUS_LABEL: Record<KpiWartungRow['status'], string> = {
  kein_plan:     'Kein Plan',
  ueberfaellig:  'Überfällig',
  faellig:       'Fällig (<30T)',
  anstehend:     'Anstehend (<90T)',
  ok:            'OK',
}

const STATUS_COLOR: Record<KpiWartungRow['status'], string> = {
  kein_plan:     '#6b7280',
  ueberfaellig:  '#dc2626',
  faellig:       '#f59e0b',
  anstehend:     '#0ea5e9',
  ok:            '#22c55e',
}

const fmtDate = (v: unknown) => typeof v === 'string' && v ? new Date(v).toLocaleDateString('de-CH') : '—'
const fmtDays = (v: unknown) => typeof v === 'number' ? (v < 0 ? `${v} T` : `in ${v} T`) : '—'

const COLUMNS: ColumnDef<KpiWartungRow>[] = [
  { key: 'project_name',            label: 'Projekt' },
  { key: 'customer_name',           label: 'Kunde' },
  { key: 'wartung_interval_months', label: 'Intervall (Mt.)', align: 'right' },
  { key: 'wartung_last_at',         label: 'Letzter Service', format: fmtDate },
  { key: 'wartung_next_due_at',     label: 'Nächste Fälligkeit', format: fmtDate },
  { key: 'days_remaining',          label: 'Rest',              align: 'right', format: fmtDays },
  {
    key: 'status',
    label: 'Status',
    render: (v) => {
      const s = v as KpiWartungRow['status']
      return <span style={{ background: STATUS_COLOR[s], color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>{STATUS_LABEL[s]}</span>
    },
  },
]

export default function WartungTab() {
  const { data, loading, error } = useKpiData<KpiWartungRow>('vw_kpi_wartung')

  const cards = useMemo(() => {
    if (!data) return []
    const count = (s: KpiWartungRow['status']) => data.filter(r => r.status === s).length
    return [
      { label: 'Überfällig',         value: String(count('ueberfaellig')), color: count('ueberfaellig') > 0 ? '#dc2626' : undefined },
      { label: 'Fällig (<30 Tage)',  value: String(count('faellig')),      color: count('faellig') > 0      ? '#f59e0b' : undefined },
      { label: 'Anstehend (<90 T.)', value: String(count('anstehend')) },
      { label: 'Projekte mit Plan',  value: String(data.length) },
    ]
  }, [data])

  const sorted = useMemo(() => {
    if (!data) return []
    const rank: Record<KpiWartungRow['status'], number> = { ueberfaellig: 0, faellig: 1, anstehend: 2, ok: 3, kein_plan: 4 }
    return [...data].sort((a, b) => {
      const r = rank[a.status] - rank[b.status]
      if (r !== 0) return r
      return (a.days_remaining ?? 0) - (b.days_remaining ?? 0)
    })
  }, [data])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      <KpiCards cards={cards} columns={4} />
      {sorted.length === 0 ? (
        <div className="admin-empty">Keine Projekte mit Wartungsplan. Setze ein Intervall im Projekt-Detail.</div>
      ) : (
        <DataTable data={sorted} columns={COLUMNS} defaultSort={{ key: 'wartung_next_due_at', dir: 'asc' }} />
      )}
    </div>
  )
}
