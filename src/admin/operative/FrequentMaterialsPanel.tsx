import { useEffect, useMemo, useState } from 'react'
import { listAllMaterials } from '../../api/admin/materials'
import { listSuppliers } from '../../api/admin/suppliers'
import {
  getFrequentMaterials, addFrequentMaterial, removeFrequentMaterial, reorderFrequentMaterials,
  FrequentMaterial,
} from '../../api/admin'
import { MaterialCombobox, MaterialOption } from './MaterialCombobox'
import { fmtCHF } from '../utils/format'

/**
 * Kuratierte "häufig benutzte Ersatzteile" pflegen (Tab im Material-Bereich,
 * sichtbar sobald der Workflow `ersatzteil_prompt` aktiv ist).
 *
 * Hier nur die Artikel-Auswahl + Reihenfolge — die Menge gibt der Mitarbeiter
 * beim Rapport-Abschluss ein. Gebuchte Teile werden als verrechenbare
 * material_usage-Position gebucht (VK aus dem Aufschlag, Lagerabbuchung).
 *
 * Rendert KEIN eigenes `admin-page` — der Tab-Container in MaterialsScreen liefert
 * das Layout.
 */
interface Supplier { id: string; name: string }

export default function FrequentMaterialsPanel() {
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [curated, setCurated] = useState<FrequentMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  async function reloadCurated() {
    setCurated(await getFrequentMaterials())
  }

  useEffect(() => {
    Promise.all([
      listAllMaterials(),
      getFrequentMaterials(),
    ])
      // MaterialOption verlangt unit_price als Zahl, der Materialstamm lässt es
      // null (kein fixer VK-Override). Bisher steckte dieselbe Behauptung im
      // `as Promise<MaterialOption[]>` am Aufruf; sie bleibt punktuell hier,
      // bis MaterialOption mit dem Umzug von ReportCreateForm/Chat nachzieht.
      .then(([m, c]) => { setMaterials(m as MaterialOption[]); setCurated(c) })
      .catch(() => setError('Laden fehlgeschlagen'))
      .finally(() => setLoading(false))
    // Lieferanten nur für den optionalen Material-Filter — Fehler darf das Panel
    // nicht blockieren (Filter bleibt dann leer). Analog QuoteCreateForm.
    listSuppliers()
      .then(setSuppliers)
      .catch(() => {})
  }, [])

  // Bereits kuratierte art_nr ausblenden, damit kein Doppel-Hinzufügen angeboten wird.
  const curatedArtNrs = useMemo(() => new Set(curated.map(c => c.art_nr)), [curated])
  const selectable = useMemo(
    () => materials.filter(m => !curatedArtNrs.has(m.art_nr)),
    [materials, curatedArtNrs],
  )

  // Lieferant-/Kategorie-Filter für die Combobox (analog Offerte) — Optionen aus
  // dem Materialstamm ableiten: nur verwendete Lieferanten, vorhandene Kategorien.
  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(s => [s.id, s.name])), [suppliers])
  const usedSupplierIds = useMemo(() => new Set(materials.map(m => m.supplier_id).filter(Boolean)), [materials])
  const supplierOptions = useMemo(() => suppliers.filter(s => usedSupplierIds.has(s.id)), [suppliers, usedSupplierIds])
  const categories = useMemo(
    () => [...new Set(materials.map(m => m.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [materials],
  )

  async function add(artNr: string) {
    if (!artNr || busy) return
    setBusy(true)
    setError('')
    try {
      await addFrequentMaterial(artNr)
      await reloadCurated()
    } catch {
      setError('Hinzufügen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setError('')
    try {
      await removeFrequentMaterial(id)
      await reloadCurated()
    } catch {
      setError('Entfernen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...curated]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setCurated(next)  // optimistisch
    setBusy(true)
    setError('')
    try {
      await reorderFrequentMaterials(next.map(c => c.id))
    } catch {
      setError('Reihenfolge speichern fehlgeschlagen')
      await reloadCurated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Häufig benutzte Produkte</div>
          <div className="admin-page-subtitle" style={{ maxWidth: 640 }}>
            Diese Artikel werden dem Mitarbeiter beim Rapport-Abschluss als Schnellauswahl
            angeboten (Mehrfachauswahl + Menge). Aktiviert via Workflow „Häufig benutzte
            Ersatzteile beim Rapport abfragen" (Konfiguration → Workflows).
          </div>
        </div>
      </div>

      {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>Produkt hinzufügen</span>
          <MaterialCombobox
            materials={selectable}
            supplierMap={supplierMap}
            supplierFilter={supplierFilter}
            categoryFilter={categoryFilter}
            value=""
            onChange={add}
          />
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
            <option value="">Alle Lieferanten</option>
            {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Alle Artikelgruppen</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Reihenfolge</th>
                <th>Art.-Nr.</th>
                <th>Bezeichnung</th>
                <th>VK-Preis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {curated.length === 0 ? (
                <tr><td colSpan={5} className="admin-table-empty">Noch keine Produkte ausgewählt.</td></tr>
              ) : curated.map((c, i) => (
                <tr key={c.id} style={{ cursor: 'default' }}>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy || i === 0}
                        onClick={() => move(i, -1)} style={{ padding: '2px 8px' }} aria-label="Nach oben">▲</button>
                      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy || i === curated.length - 1}
                        onClick={() => move(i, 1)} style={{ padding: '2px 8px' }} aria-label="Nach unten">▼</button>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.art_nr}</td>
                  <td>
                    <strong>{c.name}</strong>
                    {!c.is_active && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-red)' }}>(inaktiv)</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtCHF(c.calc_vk)} / {c.unit}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy}
                      onClick={() => remove(c.id)}>Entfernen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
