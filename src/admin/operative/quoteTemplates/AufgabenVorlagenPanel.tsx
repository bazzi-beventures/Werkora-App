import { useEffect, useState } from 'react'
import {
  createProjectTaskTemplate, deleteProjectTaskTemplate, listProjectTaskTemplates,
  updateProjectTaskTemplate,
} from '../../../api/admin/projectTaskTemplates'
import type { ProjectTaskTemplate } from '../../../api/admin/projectTaskTemplates'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast, ToastHost } from '../../components/useToast'

// Standard-Aufgaben: Checklisten-Punkte, die auf JEDER neuen Baustelle gelten
// ("Schlüssel beim Hauswart abholen", "Baustelle besenrein übergeben").
//
// Beim Anlegen eines Kundenprojekts kopiert das Backend die aktiven Vorlagen in
// die Projekt-Checkliste — der Monteur sieht sie danach in der Mitarbeiter-PWA.
// Kopie statt Verknüpfung: Änderungen hier wirken nur auf KÜNFTIGE Projekte,
// und auf dem Projekt darf der Admin einzelne Punkte löschen, ohne die Vorlage
// anzufassen (Projektmaske → Reiter «Aufgaben»).
export function AufgabenVorlagenPanel() {
  const [templates, setTemplates] = useState<ProjectTaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProjectTaskTemplate | null>(null)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()

  async function load() {
    setLoading(true)
    try {
      setTemplates(await listProjectTaskTemplates())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleAdd() {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    setError('')
    try {
      await createProjectTaskTemplate(text)
      setNewText('')
      showToast('Standard-Aufgabe angelegt')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit() {
    const text = editingText.trim()
    if (!editingId || !text) return
    setSavingId(editingId)
    setError('')
    try {
      await updateProjectTaskTemplate(editingId, { text })
      setEditingId(null)
      setEditingText('')
      showToast('Standard-Aufgabe gespeichert')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingId(null)
    }
  }

  // Pausieren statt löschen: die Vorlage bleibt stehen, kommt aber nicht mehr
  // auf neue Projekte — z.B. eine Saison-Aufgabe.
  async function toggleActive(t: ProjectTaskTemplate) {
    setSavingId(t.id)
    setError('')
    try {
      await updateProjectTaskTemplate(t.id, { is_active: !t.is_active })
      showToast(t.is_active ? 'Standard-Aufgabe pausiert' : 'Standard-Aufgabe aktiviert')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete() {
    const target = confirmDelete
    if (!target) return
    setConfirmDelete(null)
    setSavingId(target.id)
    setError('')
    try {
      await deleteProjectTaskTemplate(target.id)
      showToast('Standard-Aufgabe gelöscht')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingId(null)
    }
  }

  const activeCount = templates.filter(t => t.is_active).length

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Aufgaben-Vorlagen</div>
          <div className="admin-page-subtitle">
            Standard-Aufgaben, die auf jedes neue Projekt kopiert werden
          </div>
        </div>
      </div>

      <div className="admin-table-wrap" style={{ padding: 24 }}>
        <div className="admin-section-title" style={{ marginBottom: 6 }}>Standard-Aufgaben</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, maxWidth: 720 }}>
          Diese Punkte landen beim Anlegen eines Projekts automatisch in dessen Checkliste —
          der Monteur sieht sie in der Mitarbeiter-App und hakt sie dort ab. Nicht benötigte
          Punkte lassen sich pro Projekt in der Projektmaske (Reiter «Aufgaben») löschen.
          Änderungen hier gelten nur für künftige Projekte; laufende Projekte bleiben, wie sie sind.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="admin-form-input"
            style={{ flex: 1 }}
            placeholder="Neue Standard-Aufgabe… (z.B. Baustelle besenrein übergeben)"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAdd() } }}
          />
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={adding || !newText.trim()}
            onClick={() => void handleAdd()}
          >
            {adding ? '…' : '+ Aufgabe'}
          </button>
        </div>

        {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : templates.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Noch keine Standard-Aufgaben — neue Projekte starten mit leerer Checkliste.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.map(t => {
                const isEditing = editingId === t.id
                const busy = savingId === t.id
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', opacity: t.is_active ? 1 : 0.6,
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          className="admin-form-input"
                          rows={2}
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          style={{ resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => { setEditingId(null); setEditingText('') }}
                            disabled={busy}
                          >
                            Abbrechen
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-primary"
                            onClick={() => void handleSaveEdit()}
                            disabled={busy || !editingText.trim()}
                          >
                            {busy ? 'Speichern…' : 'Speichern'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className={`admin-badge ${t.is_active ? 'admin-badge-paid' : 'admin-badge-open'}`}>
                          {t.is_active ? 'aktiv' : 'pausiert'}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                          {t.text}
                        </span>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          onClick={() => { setEditingId(t.id); setEditingText(t.text) }}
                          disabled={busy}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          onClick={() => void toggleActive(t)}
                          disabled={busy}
                        >
                          {t.is_active ? 'Pausieren' : 'Aktivieren'}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          onClick={() => setConfirmDelete(t)}
                          disabled={busy}
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              {activeCount === 0
                ? 'Keine aktive Vorlage — neue Projekte starten mit leerer Checkliste.'
                : `${activeCount} Aufgabe${activeCount === 1 ? '' : 'n'} kommt auf jedes neue Projekt.`}
            </div>
          </>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Standard-Aufgabe löschen?"
          message={`"${confirmDelete.text}" wird nicht mehr auf neue Projekte kopiert. Bereits angelegte Projekte behalten die Aufgabe.`}
          confirmLabel="Löschen"
          cancelLabel="Abbrechen"
          variant="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <ToastHost toast={toast} />
    </>
  )
}
