import { useEffect, useMemo, useState } from 'react'
import { useKpiData } from '../useKpiData'
import type { CategoryPricingRow, SupplierPricingRow, InstallationTemplateRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'
import { listSuppliers } from '../../../api/admin/suppliers'

interface SupplierLite { id: string; name: string }
type SupplierPricingRowWithName = SupplierPricingRow & { supplier_name: string }

const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 2 }) : '—'
const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'

const CAT_COLUMNS: ColumnDef<CategoryPricingRow>[] = [
  { key: 'category', label: 'Kategorie' },
  { key: 'margin_factor', label: 'Margenfaktor', align: 'right', format: num },
  { key: 'notes', label: 'Notizen' },
]

const INSTALL_COLUMNS: ColumnDef<InstallationTemplateRow>[] = [
  { key: 'label', label: 'Bezeichnung' },
  { key: 'default_fee', label: 'Pauschale', align: 'right', format: chf },
  { key: 'notes', label: 'Hinweis' },
]

const SUP_COLUMNS: ColumnDef<SupplierPricingRowWithName>[] = [
  { key: 'supplier_name', label: 'Lieferant' },
  { key: 'category', label: 'Kategorie' },
  { key: 'markup_pct', label: 'Aufschlag %', align: 'right', format: (v) => typeof v === 'number' ? `${v}%` : '—' },
]

export default function PricingTab() {
  const { data: catData, loading: catLoad, error: catErr } = useKpiData<CategoryPricingRow>('category_pricing_rules')
  const { data: supData, loading: supLoad, error: supErr } = useKpiData<SupplierPricingRow>('supplier_pricing_rules')
  const { data: installData, loading: installLoad, error: installErr } = useKpiData<InstallationTemplateRow>('installation_templates')

  const [suppliers, setSuppliers] = useState<SupplierLite[] | null>(null)
  useEffect(() => {
    let cancelled = false
    listSuppliers()
      .then((rows) => { if (!cancelled) setSuppliers(rows) })
      .catch(() => { if (!cancelled) setSuppliers([]) })
    return () => { cancelled = true }
  }, [])

  const supRowsWithName = useMemo<SupplierPricingRowWithName[]>(() => {
    const map = new Map((suppliers ?? []).map((s) => [s.id, s.name]))
    return (supData ?? []).map((r) => ({ ...r, supplier_name: map.get(r.supplier_id) ?? r.supplier_id }))
  }, [supData, suppliers])

  const loading = catLoad || supLoad || installLoad || suppliers === null
  const error = catErr || supErr || installErr

  const cards = useMemo(() => {
    const catRows = catData ?? []
    const supRows = supData ?? []
    const avgMargin = catRows.length ? catRows.reduce((s, r) => s + r.margin_factor, 0) / catRows.length : 0
    const avgMarkup = supRows.length ? supRows.reduce((s, r) => s + r.markup_pct, 0) / supRows.length : 0
    const suppliers = new Set(supRows.map((r) => r.supplier_id)).size
    return [
      { label: 'Kategorie-Regeln', value: String(catRows.length) },
      { label: 'Ø Margenfaktor', value: num(avgMargin) as string },
      { label: 'Lieferanten', value: String(suppliers) },
      { label: 'Ø Aufschlag', value: `${num(avgMarkup)}%` },
    ]
  }, [catData, supData])

  const chartData = useMemo(
    () => (catData ?? []).map((r) => ({ name: r.category.slice(0, 18), Marge: r.margin_factor })),
    [catData],
  )

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* KPI Cards */}
      <KpiCards cards={cards} columns={4} />

      {/* Chart — full width */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[{ dataKey: 'Marge', label: 'Margenfaktor' }]}
        height={300}
      />

      {/* Tables — full width, stacked */}
      <h3 className="kpi-bi-section-title">Kategorie-Margen</h3>
      <DataTable data={catData ?? []} columns={CAT_COLUMNS} defaultSort={{ key: 'margin_factor', dir: 'desc' }} />

      <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>Lieferanten-Aufschläge</h3>
      <DataTable data={supRowsWithName} columns={SUP_COLUMNS} defaultSort={{ key: 'markup_pct', dir: 'desc' }} />

      <h3 className="kpi-bi-section-title" style={{ marginTop: 8 }}>Montage-Vorlagen</h3>
      <DataTable data={installData ?? []} columns={INSTALL_COLUMNS} defaultSort={{ key: 'default_fee', dir: 'asc' }} />
    </div>
  )
}
