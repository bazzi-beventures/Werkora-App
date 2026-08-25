import { useState, useMemo } from 'react'
import { useKpiData } from '../useKpiData'
import type { KpiFinanzenMonatRow, ColumnDef } from '../types'
import KpiCards from '../components/KpiCards'
import DataTable from '../components/DataTable'
import BiBarChart from '../components/BiBarChart'

const chf = (v: unknown) => typeof v === 'number' ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '—'
const num = (v: unknown) => typeof v === 'number' ? v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : '—'
const chfSigned = (v: unknown) => {
  if (typeof v !== 'number') return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}`
}

const COLUMNS: ColumnDef<KpiFinanzenMonatRow>[] = [
  { key: 'jahr_monat', label: 'Monat' },
  { key: 'arbeitsstunden', label: 'Stunden', align: 'right', format: num },
  { key: 'lohnkosten_intern', label: 'Lohn intern', align: 'right', format: chf },
  { key: 'lohnkosten', label: 'Lohn Verrechn.', align: 'right', format: chf },
  { key: 'materialkosten_intern', label: 'Material intern', align: 'right', format: chf },
  { key: 'materialkosten', label: 'Material Verrechn.', align: 'right', format: chf },
  { key: 'total_kosten_intern', label: 'Total intern', align: 'right', format: chf },
  {
    key: 'marge_arbeit',
    label: 'Marge',
    align: 'right',
    render: (_v, row) => {
      const m = row.marge_arbeit + row.marge_material
      const color = m >= 0 ? '#16a34a' : '#dc2626'
      return <span style={{ color }}>{chfSigned(m)}</span>
    },
  },
  { key: 'rechnungen_betrag', label: 'Rechnungen', align: 'right', format: chf },
  { key: 'offerten_betrag', label: 'Offerten', align: 'right', format: chf },
]

export default function FinanzenTab() {
  const { data, loading, error } = useKpiData<KpiFinanzenMonatRow>('vw_kpi_finanzen_monat')
  const currentYear = new Date().getFullYear()
  const [yearFilter, setYearFilter] = useState<number | null>(null)

  const availableYears = useMemo(() => {
    const years = Array.from(new Set((data ?? []).map((r) => r.jahr))).sort((a, b) => b - a)
    return years.slice(0, 3)
  }, [data])

  const yearPresets: { key: number | null; label: string }[] = [
    { key: null, label: 'Alles' },
    ...availableYears.map((y) => ({ key: y, label: String(y) })),
  ]

  const filtered = useMemo(
    () => yearFilter == null ? (data ?? []) : (data ?? []).filter((r) => r.jahr === yearFilter),
    [data, yearFilter],
  )

  const chartData = useMemo(
    () =>
      filtered
        .slice()
        .sort((a, b) => a.jahr_monat.localeCompare(b.jahr_monat))
        .map((r) => ({ name: r.jahr_monat, Kosten: r.total_kosten_intern, Rechnungen: r.rechnungen_betrag })),
    [filtered],
  )

  const cards = useMemo(() => {
    if (!filtered.length) return []
    const ytd = yearFilter != null ? filtered : filtered.filter((r) => r.jahr === currentYear)
    const kostenYtd = ytd.reduce((s, r) => s + r.total_kosten_intern, 0)
    const umsatzYtd = ytd.reduce((s, r) => s + r.rechnungen_bezahlt_betrag, 0)
    const margeYtd = ytd.reduce((s, r) => s + r.marge_arbeit + r.marge_material, 0)
    const debiTage = ytd.filter((r) => r.debitorenlaufzeit_tage > 0)
    const avgDebi = debiTage.length ? debiTage.reduce((s, r) => s + r.debitorenlaufzeit_tage, 0) / debiTage.length : 0
    const yearLabel = yearFilter != null ? String(yearFilter) : String(currentYear)
    return [
      { label: `Kosten ${yearLabel}`, value: chf(kostenYtd) },
      { label: `Umsatz ${yearLabel}`, value: chf(umsatzYtd), color: '#22c55e' },
      { label: `Marge ${yearLabel}`, value: chfSigned(margeYtd), color: margeYtd >= 0 ? '#16a34a' : '#dc2626' },
      { label: 'Ø Debitorenlaufzeit', value: `${avgDebi.toFixed(0)} Tage` },
    ]
  }, [filtered, yearFilter, currentYear])

  // Datenqualität-Banner: max() pro Monat als untere Schranke (siehe Plan).
  const dataQuality = useMemo(() => {
    const maxOhneLohn = filtered.reduce((m, r) => Math.max(m, r.mitarbeiter_ohne_lohn_count), 0)
    const maxOhneEk = filtered.reduce((m, r) => Math.max(m, r.material_ohne_ek_count), 0)
    return { maxOhneLohn, maxOhneEk }
  }, [filtered])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <div className="kpi-bi-layout">
      {/* Year presets */}
      <div className="kpi-date-presets">
        {yearPresets.map((p) => (
          <button
            key={String(p.key)}
            className={`kpi-date-btn${yearFilter === p.key ? ' active' : ''}`}
            onClick={() => setYearFilter(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Datenqualität-Banner */}
      {(dataQuality.maxOhneLohn > 0 || dataQuality.maxOhneEk > 0) && (
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 6,
            padding: '10px 14px',
            color: '#92400e',
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
        </div>
      )}

      {/* KPI Cards */}
      <KpiCards cards={cards} columns={4} />

      {/* Chart — full width */}
      <BiBarChart
        data={chartData}
        xKey="name"
        bars={[
          { dataKey: 'Kosten', color: '#f87171', label: 'Kosten (intern)' },
          { dataKey: 'Rechnungen', color: '#22c55e', label: 'Rechnungen' },
        ]}
        height={300}
      />

      {/* Table — full width */}
      <DataTable data={filtered} columns={COLUMNS} defaultSort={{ key: 'jahr_monat', dir: 'desc' }} />
    </div>
  )
}
