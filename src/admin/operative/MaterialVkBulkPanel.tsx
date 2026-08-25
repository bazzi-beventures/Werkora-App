import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  previewVkBulkIncrease, applyVkBulkIncrease,
  VkBulkPreview, VkBulkRow,
} from '../../api/admin'
import { isOfflineError } from '../../api/client'
import { getMaterialsMeta } from '../../api/admin/materials'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ToastHost, useToast } from '../components/useToast'

// Massen-VK-Erhöhung für EIGENE Materialien (Artikel ohne Lieferant).
// Zwischenlösung, solange die Lieferanten-Preislisten noch nicht vollständig
// im System sind. Aufschlags-Artikel bekommen einen angehobenen Aufschlag
// (Teuerung bleibt), Fixpreis-Artikel einen angehobenen Fixpreis; preislose
// Artikel werden übersprungen. Vorschau (alt → neu) + Auswahl, dann anwenden.

const chf = (n: number | null | undefined) =>
  n != null && n > 0 ? `CHF ${n.toFixed(2)}` : '—'

const MODE_BADGE: Record<string, { label: string; cls: string; title: string }> = {
  markup: { label: 'Aufschlag', cls: 'admin-badge-active', title: 'VK = EK × Aufschlag — der Aufschlag wird angehoben, VK steigt weiter mit dem EK (Teuerung).' },
  fixed:  { label: 'Fixpreis',  cls: 'admin-badge-draft',  title: 'Fixer VK ohne EK — der Preis wird direkt angehoben.' },
  skip:   { label: 'kein Preis', cls: 'admin-badge-admin', title: 'Weder EK noch Fixpreis hinterlegt — nicht anhebbar.' },
}

export default function MaterialVkBulkPanel() {
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [pctInput, setPctInput] = useState('')

  const [preview, setPreview] = useState<VkBulkPreview | null>(null)
  // pct, mit dem die aktuelle Vorschau berechnet wurde (für die Anwenden-Aktion).
  const [previewPct, setPreviewPct] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    (async () => {
      try {
        const meta = await getMaterialsMeta()
        setCategories(meta.categories ?? [])
      } catch { /* nicht blockierend */ }
    })()
  }, [])

  const pctNum = parseFloat(pctInput)
  const pctValid = !isNaN(pctNum) && pctNum > 0 && pctNum <= 500

  // Filter/Prozent ändern → alte Vorschau ist ungültig (Prozentsatz gilt relativ
  // zum aktuellen Preis) → verwerfen, damit nicht versehentlich stale angewendet wird.
  useEffect(() => { setPreview(null); setPreviewPct(null); setSelected(new Set()) }, [pctInput, category])

  const loadPreview = useCallback(async () => {
    if (!pctValid) return
    setLoading(true)
    try {
      const res = await previewVkBulkIncrease(pctNum, category)
      setPreview(res)
      setPreviewPct(pctNum)
      // Standard: alle anhebbaren Artikel vorausgewählt.
      setSelected(new Set(res.rows.filter(r => r.mode !== 'skip').map(r => r.art_nr)))
    } catch (e) {
      showToast(isOfflineError(e) ? 'Keine Verbindung.' : 'Vorschau fehlgeschlagen.', 'error')
    } finally {
      setLoading(false)
    }
  }, [pctValid, pctNum, category])

  const rows: VkBulkRow[] = preview?.rows ?? []
  const applicable = useMemo(() => rows.filter(r => r.mode !== 'skip'), [rows])
  const allSelected = applicable.length > 0 && applicable.every(r => selected.has(r.art_nr))

  function toggle(artNr: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(artNr) ? next.delete(artNr) : next.add(artNr)
      return next
    })
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(applicable.map(r => r.art_nr)) : new Set())
  }

  async function apply() {
    if (previewPct == null) return
    setSubmitting(true)
    try {
      // Alle anhebbaren gewählt → Filter-Modus (umgeht das Auswahl-Limit); sonst
      // die explizite Auswahl. Der Server rechnet die Ziel-VK ohnehin frisch.
      const res = allSelected
        ? await applyVkBulkIncrease(previewPct, { allApplicable: true, category })
        : await applyVkBulkIncrease(previewPct, { artNrs: [...selected] })
      const parts = [`${res.updated} Artikel angehoben`]
      if (res.skipped) parts.push(`${res.skipped} übersprungen`)
      showToast(parts.join(' · '), 'success')
      setConfirmOpen(false)
      // Vorschau verwerfen statt neu laden: verhindert, dass die schon angehobenen
      // Preise versehentlich gleich noch einmal (+pct%) angewendet werden. Für eine
      // weitere Runde muss bewusst neu auf „Vorschau" geklickt werden.
      setPreview(null)
      setPreviewPct(null)
      setSelected(new Set())
    } catch (e) {
      showToast(isOfflineError(e) ? 'Keine Verbindung — bitte erneut versuchen.' : 'Aktion fehlgeschlagen.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const selCount = selected.size

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">VK-Massenänderung</div>
          <div className="admin-page-subtitle">
            Verkaufspreise der <strong>eigenen Artikel</strong> (ohne Lieferant) prozentual anheben.
            Zwischenlösung, solange die Lieferanten-Preislisten noch nicht vollständig im System sind.
          </div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar" style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div className="admin-form-group" style={{ margin: 0 }}>
            <label className="admin-form-label">Erhöhung %</label>
            <input
              className="admin-form-input"
              type="number"
              step="0.5"
              min="0"
              max="500"
              style={{ width: 130 }}
              value={pctInput}
              onChange={e => setPctInput(e.target.value)}
              placeholder="z.B. 5"
            />
          </div>
          <div className="admin-form-group" style={{ margin: 0 }}>
            <label className="admin-form-label">Kategorie</label>
            <select className="admin-form-select" style={{ width: 'auto' }} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            className="admin-btn admin-btn-primary"
            onClick={loadPreview}
            disabled={!pctValid || loading}
          >
            {loading ? 'Laden…' : 'Vorschau'}
          </button>
        </div>

        {!pctValid && pctInput !== '' && (
          <div className="admin-form-hint" style={{ padding: '0 2px 8px', color: '#dc2626' }}>
            Bitte eine Erhöhung zwischen 0 und 500 % eingeben.
          </div>
        )}

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : preview ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '4px 2px 12px' }}>
              <span className="admin-page-subtitle" style={{ margin: 0 }}>
                {preview.total} eigene Artikel · {preview.applicable} anhebbar
                {preview.skipped > 0 && <> · {preview.skipped} ohne Preis (übersprungen)</>}
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => setConfirmOpen(true)}
                disabled={submitting || selCount === 0}
              >
                VK um {previewPct}% anheben ({selCount})
              </button>
            </div>

            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => toggleAll(e.target.checked)}
                      disabled={applicable.length === 0 || submitting}
                      title="Alle anhebbaren auswählen"
                    />
                  </th>
                  <th>Art.-Nr.</th>
                  <th>Bezeichnung</th>
                  <th>Kategorie</th>
                  <th>EK</th>
                  <th>Aktueller VK</th>
                  <th>Neuer VK</th>
                  <th>Art</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="admin-table-empty">Keine eigenen Artikel im Filter.</td></tr>
                ) : rows.map(r => {
                  const skip = r.mode === 'skip'
                  const badge = MODE_BADGE[r.mode]
                  return (
                    <tr
                      key={r.art_nr}
                      style={skip ? { opacity: 0.5 } : { cursor: 'pointer' }}
                      onClick={() => !skip && !submitting && toggle(r.art_nr)}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.art_nr)}
                          onChange={() => toggle(r.art_nr)}
                          disabled={skip || submitting}
                          title={skip ? 'Kein Preis hinterlegt — nicht anhebbar' : undefined}
                        />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.art_nr}</td>
                      <td>{r.name}</td>
                      <td style={{ color: 'var(--muted)' }}>{r.category ?? '—'}</td>
                      <td>{chf(r.cost_price)}</td>
                      <td>{chf(r.old_vk)}</td>
                      <td>
                        {skip ? '—' : (
                          <>
                            <strong>{chf(r.new_vk)}</strong>
                            {r.new_vk > r.old_vk && (
                              <span style={{ color: '#16a34a', marginLeft: 6, fontSize: 12 }}>
                                +{(r.new_vk - r.old_vk).toFixed(2)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td><span className={`admin-badge ${badge.cls}`} title={badge.title}>{badge.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        ) : (
          <div className="admin-table-empty" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
            Erhöhung % eingeben und auf <strong>Vorschau</strong> klicken.
          </div>
        )}
      </div>

      {confirmOpen && previewPct != null && (
        <ConfirmDialog
          title={`VK um ${previewPct}% anheben?`}
          message={
            <>
              Der Verkaufspreis von <strong>{selCount} eigenen Artikel{selCount === 1 ? '' : 'n'}</strong> wird
              um <strong>{previewPct}%</strong> angehoben. Aufschlags-Artikel behalten den Teuerung-Bezug zum EK,
              Fixpreis-Artikel bekommen den neuen Preis direkt. Bestehende Offerten und Rechnungen bleiben
              unverändert — nur der Stammpreis ändert sich.
            </>
          }
          confirmLabel={`Ja, um ${previewPct}% anheben`}
          busyLabel="Anheben…"
          busy={submitting}
          variant="primary"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={apply}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}
