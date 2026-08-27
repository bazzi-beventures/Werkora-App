import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  scanMaterialCleanup, bulkSetMaterialStatus, bulkSetMaterialStatusAll,
  MaterialCleanupScan, MaterialCleanupRow, MaterialSzenario,
} from '../../api/admin'
import { isOfflineError } from '../../api/client'
import { getMaterialsMeta } from '../../api/admin/materials'
import { listSuppliers } from '../../api/admin/suppliers'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ToastHost, useToast } from '../components/useToast'

// SAP-klassische Status-Benennung — an EINER Stelle, damit der Begriff
// später in einer Zeile austauschbar bleibt (z.B. auf 'Gesperrt').
const STATUS_TERMS = { active: 'Aktiv', inactive: 'Löschvormerkung' }

const PAGE_SIZE = 50   // analog zur Material-Übersicht

interface Supplier { id: string; name: string; prefix: string }

// Kandidat-Buckets (Bereinigungs-Vorschläge) zuerst; die geschützten danach.
const SZENARIOS: { code: MaterialSzenario; label: string; candidate: boolean }[] = [
  { code: 'NEVER_USED_OLD',    label: 'Nie verwendet, alt (>1 J.)',            candidate: true  },
  { code: 'QUOTE_ONLY_OLD',    label: 'Nur offeriert, alt – nie verbaut',      candidate: true  },
  { code: 'STALE_USED',        label: 'Verwendet, aber veraltet (>1 J.)',      candidate: true  },
  { code: 'NEVER_USED_NEW',    label: 'Nie verwendet, neu (<1 J.)',            candidate: false },
  { code: 'QUOTE_ONLY_NEW',    label: 'Nur offeriert, neu – Rechnung evtl.',   candidate: false },
  { code: 'USED_PENDING',      label: 'Verwendet, noch nicht verrechnet',      candidate: false },
  { code: 'RAPPORT_MATERIAL',  label: 'Rapport-Material (verrechnet)',         candidate: false },
  { code: 'QUOTED_AND_BILLED', label: 'Offeriert & verrechnet',               candidate: false },
  { code: 'RECENTLY_USED',     label: `${STATUS_TERMS.active} – kürzlich verwendet (≤90 T)`, candidate: false },
]
const SZ_LABEL: Record<string, string> = Object.fromEntries(SZENARIOS.map(s => [s.code, s.label]))

export default function MaterialCleanupScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [status, setStatus] = useState('')            // '' = alle, 'active', 'inactive'
  const [szenario, setSzenario] = useState<MaterialSzenario | ''>('')
  const [page, setPage] = useState(1)

  const [scan, setScan] = useState<MaterialCleanupScan | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // true = "alle Artikel im Filter" (über alle Seiten) — Massenbereinigung ohne
  // Einzel-Auswahl; `selected` ist dann irrelevant.
  const [allFiltered, setAllFiltered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState<{ targetActive: boolean } | null>(null)
  const { toast, showToast } = useToast()

  // Lieferanten + Kategorien für die Filter-Dropdowns.
  useEffect(() => {
    (async () => {
      try {
        const [sups, meta] = await Promise.all([
          listSuppliers(),
          // include_inactive: dieses Tool arbeitet auf archivierten Artikeln — ohne den
          // Parameter fehlen Kategorien, in denen bereits alles auf Loeschvormerkung steht.
          getMaterialsMeta({ includeInactive: true }),
        ])
        setSuppliers(sups)
        setCategories(meta.categories ?? [])
      } catch { /* nicht blockierend */ }
    })()
  }, [])

  // Filter/Szenario-Wechsel → zurück auf Seite 1.
  useEffect(() => { setPage(1) }, [category, supplierId, status, szenario])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await scanMaterialCleanup({
        category, supplier_id: supplierId, status, szenario,
        page, page_size: PAGE_SIZE,
      })
      setScan(res)
    } catch (e) {
      showToast(isOfflineError(e) ? 'Keine Verbindung.' : 'Scan fehlgeschlagen.', 'error')
    } finally {
      setLoading(false)
    }
  }, [category, supplierId, status, szenario, page])

  useEffect(() => { load() }, [load])
  // Filter/Szenario-Wechsel → Auswahl verwerfen (auch die Filter-weite).
  // Seiten-Wechsel behandelt goToPage: die Filter-weite Auswahl überlebt Blättern.
  useEffect(() => { setSelected(new Set()); setAllFiltered(false) }, [category, supplierId, status, szenario])

  function goToPage(p: number) {
    setPage(p)
    if (!allFiltered) setSelected(new Set())
  }

  const supplierMap = useMemo(
    () => Object.fromEntries(suppliers.map(s => [s.id, s.name])) as Record<string, string>,
    [suppliers],
  )
  const counts = scan?.counts ?? {}
  const blocked = scan?.blocked ?? []
  const rows: MaterialCleanupRow[] = scan?.rows ?? []

  // Nicht auswählbar = aktiver Bestand in einem gesperrten Szenario (kann weder
  // deaktiviert werden noch reaktiviert — er ist schon aktiv). Inaktive Zeilen
  // bleiben immer wählbar (Reaktivierung).
  const isProtected = (r: MaterialCleanupRow) => blocked.includes(r.szenario) && r.is_active
  const selectable = useMemo(() => rows.filter(r => !isProtected(r)), [rows, blocked])
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.art_nr))

  function toggle(artNr: string) {
    if (allFiltered) {
      // Einzel-Abwahl beendet den Filter-weiten Modus: zurück zur Seiten-Auswahl
      // ohne den abgewählten Artikel.
      setAllFiltered(false)
      setSelected(new Set(selectable.filter(r => r.art_nr !== artNr).map(r => r.art_nr)))
      return
    }
    setSelected(prev => {
      const next = new Set(prev)
      next.has(artNr) ? next.delete(artNr) : next.add(artNr)
      return next
    })
  }
  function toggleAll(checked: boolean) {
    setAllFiltered(false)
    setSelected(checked ? new Set(selectable.map(r => r.art_nr)) : new Set())
  }

  async function applyStatus(targetActive: boolean) {
    setSubmitting(true)
    try {
      const res = allFiltered
        ? await bulkSetMaterialStatusAll(
            { category, supplier_id: supplierId, status, szenario }, targetActive,
          )
        : await bulkSetMaterialStatus([...selected], targetActive)
      const parts = [`${res.updated} aktualisiert`]
      if (res.skipped_blocked) parts.push(`${res.skipped_blocked} gesperrt übersprungen`)
      showToast(parts.join(' · '), 'success')
      setSelected(new Set())
      setAllFiltered(false)
      setConfirm(null)
      await load()
    } catch (e) {
      showToast(isOfflineError(e) ? 'Keine Verbindung — bitte erneut versuchen.' : 'Aktion fehlgeschlagen.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const rowTotal = scan?.row_total ?? 0
  const totalPages = scan?.total_pages ?? 1
  const rangeStart = rowTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, rowTotal)

  // Kontextabhängige Aktions-Buttons: im Inaktiv-Filter nur „Reaktivieren",
  // im Aktiv-Filter nur „Auf Löschvormerkung setzen", sonst beide.
  const showDeactivate = status !== 'inactive'
  const showReactivate = status !== 'active'

  // Anzahl, auf die eine Massenaktion wirkt (Filter-weit oder Seiten-Auswahl).
  const effCount = allFiltered ? rowTotal : selected.size

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Materialdatenbereinigung</div>
          <div className="admin-page-subtitle">
            {scan ? `${scan.total} Artikel im Filter` : 'Laden…'}
            {' · '}Inaktiv = {STATUS_TERMS.inactive} (nur ausgeblendet, nie gelöscht, reversibel)
          </div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Alle Artikelgruppen</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Alle Lieferanten</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="admin-form-select" style={{ width: 'auto', flexShrink: 0 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Alle Status</option>
            <option value="active">Nur {STATUS_TERMS.active}</option>
            <option value="inactive">Nur {STATUS_TERMS.inactive}</option>
          </select>
          {szenario && (
            <button className="admin-btn admin-btn-secondary" onClick={() => setSzenario('')}>
              Szenario-Filter aufheben
            </button>
          )}
        </div>

        {/* Szenario-Karten (optionaler Filter) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '4px 2px 14px' }}>
          {SZENARIOS.map(s => {
            const n = counts[s.code] ?? 0
            const active = szenario === s.code
            return (
              <button
                key={s.code}
                onClick={() => setSzenario(active ? '' : s.code)}
                title={s.label}
                style={{
                  textAlign: 'left', cursor: 'pointer', minWidth: 150, flex: '1 1 150px',
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: active ? 'var(--primary-soft)' : 'var(--surface)',
                  borderLeft: s.candidate ? '4px solid var(--danger)' : (active ? '2px solid var(--primary)' : '1px solid var(--border)'),
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: s.candidate ? 'var(--danger)' : 'var(--text)' }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.25 }}>{s.label}</div>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <>
            {/* Massenaktionen — oben, wirken auf die Auswahl (Seite oder ganzer Filter) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '0 2px 12px' }}>
              {showDeactivate && (
                <button
                  className="admin-btn admin-btn-danger"
                  onClick={() => setConfirm({ targetActive: false })}
                  disabled={submitting || effCount === 0}
                >
                  Auf {STATUS_TERMS.inactive} setzen ({effCount})
                </button>
              )}
              {showReactivate && (
                <button
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setConfirm({ targetActive: true })}
                  disabled={submitting || effCount === 0}
                >
                  Reaktivieren ({effCount})
                </button>
              )}
              {allFiltered ? (
                <span className="admin-page-subtitle" style={{ margin: 0 }}>
                  Alle {rowTotal} Artikel im Filter ausgewählt (alle Seiten) ·{' '}
                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={() => { setAllFiltered(false); setSelected(new Set()) }}
                    disabled={submitting}
                  >
                    Auswahl aufheben
                  </button>
                </span>
              ) : allSelected && rowTotal > rows.length ? (
                <span className="admin-page-subtitle" style={{ margin: 0 }}>
                  Seite ausgewählt ·{' '}
                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={() => setAllFiltered(true)}
                    disabled={submitting}
                  >
                    Alle {rowTotal} Artikel im Filter auswählen
                  </button>
                </span>
              ) : selected.size > 0 ? (
                <span className="admin-page-subtitle" style={{ margin: 0 }}>{selected.size} ausgewählt</span>
              ) : null}
            </div>

            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allFiltered || allSelected}
                      onChange={e => toggleAll(e.target.checked)}
                      disabled={selectable.length === 0 || submitting}
                      title="Seite auswählen"
                    />
                  </th>
                  <th>Art.-Nr.</th>
                  <th>Bezeichnung</th>
                  <th>Lieferant</th>
                  <th>Artikelgruppe</th>
                  <th>Szenario</th>
                  <th>Alter</th>
                  <th>Letzte Nutzung</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="admin-table-empty">Keine Artikel im Filter.</td></tr>
                ) : rows.map(r => {
                  const prot = isProtected(r)
                  return (
                    <tr
                      key={r.art_nr}
                      style={prot ? { opacity: 0.55 } : { cursor: 'pointer' }}
                      onClick={() => !prot && !submitting && toggle(r.art_nr)}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allFiltered ? !prot : selected.has(r.art_nr)}
                          onChange={() => toggle(r.art_nr)}
                          disabled={prot || submitting}
                          title={prot ? 'Aktiver Bestand — geschützt' : undefined}
                        />
                      </td>
                      <td className="primary">{r.art_nr}</td>
                      <td>
                        {r.name}
                        {r.dq_no_supplier && <span className="admin-badge admin-badge-admin" style={{ marginLeft: 6 }}>kein Lieferant</span>}
                        {r.dq_no_price && <span className="admin-badge admin-badge-admin" style={{ marginLeft: 6 }}>kein Preis</span>}
                      </td>
                      <td>{r.supplier_id ? (supplierMap[r.supplier_id] ?? '—') : '—'}</td>
                      <td>{r.category ?? '—'}</td>
                      <td><span className="admin-badge admin-badge-draft">{SZ_LABEL[r.szenario] ?? r.szenario}</span></td>
                      <td>{r.age_days != null ? `${r.age_days} T` : '—'}</td>
                      <td>{r.last_usage_date ?? '—'}</td>
                      <td>
                        <span className={`admin-badge ${r.is_active ? 'admin-badge-active' : 'admin-badge-draft'}`}>
                          {r.is_active ? STATUS_TERMS.active : STATUS_TERMS.inactive}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Paginierung (50 / Seite) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 2px' }}>
              <div className="admin-page-subtitle" style={{ margin: 0 }}>
                {rowTotal === 0 ? '0 Artikel' : `${rangeStart}–${rangeEnd} von ${rowTotal}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="admin-btn admin-btn-secondary" onClick={() => goToPage(Math.max(1, page - 1))} disabled={page <= 1 || submitting}>Zurück</button>
                <span className="admin-page-subtitle" style={{ margin: 0 }}>Seite {page} / {totalPages}</span>
                <button className="admin-btn admin-btn-secondary" onClick={() => goToPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || submitting}>Weiter</button>
              </div>
            </div>
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.targetActive ? 'Artikel reaktivieren?' : `Auf ${STATUS_TERMS.inactive} setzen?`}
          message={confirm.targetActive ? (
            <>
              {allFiltered ? `Alle ${rowTotal} Artikel im Filter (über alle Seiten)` : `${selected.size} Artikel`} wieder
              auf <strong>{STATUS_TERMS.active}</strong> setzen — sie erscheinen wieder in der Tenant-Ansicht.
              {allFiltered && ' Bereits aktive Artikel bleiben unverändert.'}
            </>
          ) : (
            <>
              {allFiltered ? `Alle ${rowTotal} Artikel im Filter (über alle Seiten)` : `${selected.size} Artikel`} auf{' '}
              <strong>{STATUS_TERMS.inactive}</strong> setzen. Sie verschwinden aus der Tenant-Ansicht, bleiben aber
              vollständig in der Datenbank und können jederzeit reaktiviert werden. Es wird nichts gelöscht.
              {allFiltered && ' Geschützte Artikel (aktiver Bestand) werden automatisch übersprungen.'}
            </>
          )}
          confirmLabel={confirm.targetActive ? 'Ja, reaktivieren' : `Ja, auf ${STATUS_TERMS.inactive} setzen`}
          busyLabel="Speichern…"
          busy={submitting}
          variant={confirm.targetActive ? 'primary' : 'danger'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => applyStatus(confirm.targetActive)}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}
