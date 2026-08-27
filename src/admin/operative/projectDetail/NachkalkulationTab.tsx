// Nachkalkulation eines einzelnen Projekts (Spec kennzahlen-refactoring §5.4).
//
// Dieselben Zahlen wie im Kennzahlen-Screen, nur an dem Ort, an dem man sie im
// Alltag braucht: beim Projekt selbst. Bewusst KEIN eigener Endpoint — die Zeile
// steht schon in `vw_kpi_projekt`, sie wird hier nur nach `projekt_id` gefiltert
// geholt (der generische kpi-views-Endpoint reicht PostgREST-Filter durch).
//
// Die Kette liest sich von oben nach unten wie die Frage, die dahintersteht:
// was war offeriert, was haben wir verrechnet, was ist fakturiert, was hat es
// uns gekostet — und was bleibt.

import { useEffect, useState } from 'react'
import { fetchKpiView } from '../../../api/kpiViews'
import type { KpiProjektRow } from '../../kpis/types'
import { finite } from '../../kpis/aggregate'

const chf = (v: unknown) => {
  const n = finite(v)
  return n === null
    ? '—'
    : `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const pct = (v: unknown) => {
  const n = finite(v)
  return n === null ? '—' : `${n.toLocaleString('de-CH', { maximumFractionDigits: 1 })} %`
}

export function NachkalkulationTab({ projectId }: { projectId: string }) {
  const [row, setRow] = useState<KpiProjektRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchKpiView<KpiProjektRow>('vw_kpi_projekt', { projekt_id: `eq.${projectId}` })
      .then((rows) => {
        if (cancelled) return
        setRow(rows[0] ?? null)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Nachkalkulation nicht ladbar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [projectId])

  if (loading) return <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!row) {
    // Kein Treffer heisst hier fast immer: archiviertes Projekt oder interner
    // Einsatz — beide fallen aus der Auswertung (vw_kpi_projekte_basis).
    return (
      <div className="admin-empty">
        Für dieses Projekt gibt es keine Nachkalkulation. Archivierte Projekte und
        interne Einsätze werden nicht ausgewertet.
      </div>
    )
  }

  const gewinnFarbe = (v: number | null) =>
    finite(v) === null ? undefined : (v as number) >= 0 ? 'var(--success)' : 'var(--danger)'

  return (
    <div className="nachkalk">
      <div className="nachkalk-grid">
        <Block title="Offeriert">
          <Zeile label="Offerte" value={chf(row.offerte_betrag)} />
          <Zeile label="Status" value={row.offerte_status ?? '—'} />
        </Block>

        <Block title="Verrechnet (Leistung)">
          <Zeile label="Lohn" value={chf(row.total_lohnkosten)} />
          <Zeile label="Material" value={chf(row.total_materialkosten)} />
          <Zeile label="Total" value={chf(row.total_kosten)} stark />
        </Block>

        <Block title="Fakturiert">
          <Zeile label="Gestellt" value={chf(row.umsatz_gestellt)} />
          <Zeile label="Bezahlt" value={chf(row.umsatz_bezahlt)} />
        </Block>

        <Block title="Eigenkosten">
          <Zeile label="Lohn intern" value={chf(row.total_lohnkosten_intern)} />
          <Zeile label="Material intern" value={chf(row.total_materialkosten_intern)} />
          <Zeile label="Total" value={chf(row.total_kosten_intern)} stark />
        </Block>
      </div>

      <div className="nachkalk-ergebnis">
        <div>
          <div className="nachkalk-ergebnis-label">Gewinn (gestellt)</div>
          <div className="nachkalk-ergebnis-wert" style={{ color: gewinnFarbe(row.gewinn_gestellt) }}>
            {chf(row.gewinn_gestellt)}
          </div>
          <div className="nachkalk-ergebnis-sub">{pct(row.marge_gestellt_pct)} Marge</div>
        </div>
        <div>
          <div className="nachkalk-ergebnis-label">Gewinn (bezahlt)</div>
          <div className="nachkalk-ergebnis-wert" style={{ color: gewinnFarbe(row.gewinn_bezahlt) }}>
            {chf(row.gewinn_bezahlt)}
          </div>
          <div className="nachkalk-ergebnis-sub">{pct(row.marge_bezahlt_pct)} Marge</div>
        </div>
      </div>

      <Hinweise row={row} />
    </div>
  )
}

/** Sagt, warum eine Zahl „—" ist oder auf einer Näherung steht. */
function Hinweise({ row }: { row: KpiProjektRow }) {
  const zeilen: string[] = []
  if (row.lohn_ohne_satz > 0) {
    zeilen.push(`${row.lohn_ohne_satz} Stundenposition(en) ohne Funktions-Stundensatz — die verrechnete Leistung ist unvollständig.`)
  }
  if (row.material_ohne_preis > 0) {
    zeilen.push(`${row.material_ohne_preis} Materialposition(en) ohne ermittelbaren Verkaufspreis.`)
  }
  if (row.lohn_intern_ohne_satz > 0) {
    zeilen.push(`${row.lohn_intern_ohne_satz} Stundenposition(en) ohne hinterlegten Monatslohn — deshalb keine Eigenkosten und kein Gewinn. Unter Personal pflegen.`)
  }
  if (row.material_ohne_ek > 0) {
    zeilen.push(`${row.material_ohne_ek} Artikel ohne Einkaufspreis — unter Material / Lager pflegen.`)
  }
  if (row.material_ek_geschaetzt > 0) {
    zeilen.push(`${row.material_ek_geschaetzt} Materialzeile(n) rechnen gegen den heutigen Katalogpreis statt gegen den Einstand von damals (erfasst vor der Umstellung). Spätere Preispflege verschiebt diese Zahlen rückwirkend.`)
  }
  if (!zeilen.length) return null
  return (
    <ul className="nachkalk-hinweise">
      {zeilen.map((z) => <li key={z}>{z}</li>)}
    </ul>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="nachkalk-block">
      <div className="nachkalk-block-title">{title}</div>
      {children}
    </div>
  )
}

function Zeile({ label, value, stark }: { label: string; value: string; stark?: boolean }) {
  return (
    <div className={`nachkalk-zeile${stark ? ' stark' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
