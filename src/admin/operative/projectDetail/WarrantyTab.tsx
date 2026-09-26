// Reiter «Garantie» im Projekt-Detail (docs/specs/garantiefall.md Phase 2, §6.1/§6.2).
//
// Der Fall liegt im Projekt, nicht in einem eigenen Hauptmenü-Punkt: die
// Übersicht über alle offenen Fälle liefert das Aufgaben-Board. Hier stehen die
// Fälle dieses Auftrags, der Knopf zum Melden, die Fall-Ansicht und die Fotos
// und Unterlagen (Datei-Kategorie `garantie`).
//
// Welche Statuswechsel ein Fall erlaubt, entscheidet der Server und liefert es
// mit (`allowed_transitions`) — die Regel steht damit nur in services/warranty.py.

import { useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../../../shared/backdropClose'
import { parseIsoDate } from '../../../shared/warranty'
import { listSuppliers, type Supplier } from '../../../api/admin/suppliers'
import {
  createWarrantyCase, createWarrantyRepairProject, listWarrantyCases, updateWarrantyCase,
  type UpdateWarrantyCaseBody, type WarrantyCase, type WarrantyCaseStatus,
  type WarrantyCause, type WarrantyChannel, type WarrantyDecision,
} from '../../../api/admin/warranty'
import type { WarrantyInfo } from '../../../api/admin/projects'
import type { ProjectStatus } from '../../constants/statuses'
import type { ToastFn } from '../../components/useToast'
import { fmtDate, todayISO } from '../../utils/format'
import { FileSections, WARRANTY_DOC_SECTIONS } from './FileSection'
import type { UseProjectDocuments } from './useProjectDocuments'
import {
  CASE_STATUS_BADGE, CASE_STATUS_LABELS, CAUSE_LABELS, CHANNEL_LABELS, DECISION_LABELS,
  TRANSITION_LABELS, canCreateRepairProject, canReportWarranty, caseChanges, fmtTag, formAus,
  fristHinweis, fristKurz, repairProjectHint, transitionButtons, type CaseForm, type FristTon,
} from './warrantyCases'

const TON_FARBE: Record<FristTon, string> = {
  ok: 'var(--success, #1f8a4c)',
  warn: 'var(--warning, #b7791f)',
  bad: 'var(--danger, #c53030)',
  neutral: 'var(--muted)',
}

function fehlertext(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export function WarrantyTab({ projectId, projectStatus, warranty, documents, onToast, onOpenProject }: {
  projectId: string
  projectStatus: ProjectStatus
  /** Fristauskunft des Servers; null = Feature «garantiefall» aus oder noch nicht geladen. */
  warranty: WarrantyInfo | null
  documents: UseProjectDocuments
  onToast: ToastFn
  /** Sprung ins Reparatur-Projekt — über die Verlassen-Abfrage der Maske. */
  onOpenProject?: (id: string) => void
}) {
  const [cases, setCases] = useState<WarrantyCase[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)

  // Erneut-versuchen zählt hoch; der Effekt lädt dann neu. `aktuell` verwirft
  // eine Antwort, die erst nach einem Projektwechsel eintrifft — sonst stünden
  // die Fälle des vorigen Projekts im Reiter.
  const [reloadTick, setReloadTick] = useState(0)
  useEffect(() => {
    let aktuell = true
    listWarrantyCases(projectId)
      .then(rows => { if (aktuell) { setCases(rows); setLoadError(false) } })
      .catch(() => { if (aktuell) { setCases([]); setLoadError(true) } })
    return () => { aktuell = false }
  }, [projectId, reloadTick])
  const reload = () => { setCases(null); setReloadTick(t => t + 1) }

  const openCase = cases?.find(c => c.id === openCaseId) ?? null
  const darfMelden = canReportWarranty(projectStatus)

  function replaceCase(updated: WarrantyCase) {
    setCases(prev => (prev ?? []).map(c => (c.id === updated.id ? updated : c)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="admin-table-wrap" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="admin-section-title" style={{ margin: 0 }}>Garantiefälle</div>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            onClick={() => setShowCreate(true)}
            disabled={!darfMelden}
            title={darfMelden ? undefined : 'Ein Garantiefall gehört zu einem abgeschlossenen Projekt.'}
          >
            + Garantiefall melden
          </button>
        </div>
        {!darfMelden && (
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
            Melden lässt sich ein Garantiefall, sobald das Projekt abgeschlossen ist.
          </div>
        )}
        {cases === null ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Lade…</div>
        ) : loadError ? (
          <div style={{ color: 'var(--danger, #c53030)', fontSize: 13 }}>
            Garantiefälle konnten nicht geladen werden.{' '}
            <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={reload}>
              Erneut versuchen
            </button>
          </div>
        ) : cases.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Zu diesem Projekt ist kein Garantiefall gemeldet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cases.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenCaseId(c.id)}
                data-testid={`warranty-case-${c.id}`}
                style={{
                  textAlign: 'left', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  padding: 12, background: 'var(--surface-2)', cursor: 'pointer', color: 'inherit', font: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>G-{c.case_no}</span>
                  <span className={`admin-badge ${CASE_STATUS_BADGE[c.status]}`}>{CASE_STATUS_LABELS[c.status]}</span>
                  {c.decision && <span style={{ fontSize: 12 }}>{DECISION_LABELS[c.decision]}</span>}
                  {c.repair_project_id && <span style={{ fontSize: 12 }}>· Reparatur-Projekt</span>}
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                    gemeldet {fmtTag(c.reported_at)} · {fristKurz(c)}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                  {c.description.length > 160 ? `${c.description.slice(0, 160)}…` : c.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="admin-table-wrap" style={{ padding: 24 }}>
        <FileSections
          files={documents.files}
          sections={WARRANTY_DOC_SECTIONS}
          uploading={documents.uploading}
          uploadingCategory={documents.uploadingCategory}
          onUpload={documents.upload}
          onDelete={documents.setConfirmDeleteId}
          onRename={documents.rename}
        />
      </div>

      {showCreate && (
        <CreateWarrantyCaseDialog
          projectId={projectId}
          warranty={warranty}
          onClose={() => setShowCreate(false)}
          onCreated={created => {
            setShowCreate(false)
            setCases(prev => [created, ...(prev ?? [])])
            onToast(`Garantiefall G-${created.case_no} gemeldet`)
          }}
          onToast={onToast}
        />
      )}

      {openCase && (
        <WarrantyCaseDialog
          key={openCase.id}
          c={openCase}
          onClose={() => setOpenCaseId(null)}
          onSaved={updated => { replaceCase(updated); onToast('Garantiefall gespeichert') }}
          onRepairCreated={updated => {
            replaceCase(updated)
            onToast('Reparatur-Projekt angelegt')
          }}
          onOpenProject={onOpenProject
            ? id => { setOpenCaseId(null); onOpenProject(id) }
            : undefined}
          onToast={onToast}
        />
      )}
    </div>
  )
}

// ─── Melden ──────────────────────────────────────────────────

export function CreateWarrantyCaseDialog({ projectId, warranty, onClose, onCreated, onToast }: {
  projectId: string
  warranty: WarrantyInfo | null
  onClose: () => void
  onCreated: (c: WarrantyCase) => void
  onToast: ToastFn
}) {
  const heute = useMemo(() => todayISO(), [])
  const [description, setDescription] = useState('')
  const [reportedAt, setReportedAt] = useState(heute)
  const [reportedVia, setReportedVia] = useState<WarrantyChannel | ''>('')
  const [reportedBy, setReportedBy] = useState('')
  const [cause, setCause] = useState<WarrantyCause | ''>('')
  const [saving, setSaving] = useState(false)

  // Frist-Stand VOR dem Speichern (Spec §6.1). Ohne Feature «garantiefall»
  // führt der Mandant keine Fristen — dann steht hier nichts, und der Server
  // friert auch keine ein.
  const hinweis = warranty
    ? fristHinweis(parseIsoDate(reportedAt), warranty.deadline_at, warranty.expiry_at)
    : null
  const zukunft = reportedAt > heute
  const dirty = !!(description.trim() || reportedBy.trim() || reportedVia || cause)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || zukunft || saving) return
    setSaving(true)
    try {
      const created = await createWarrantyCase({
        source_project_id: projectId,
        description: description.trim(),
        reported_at: reportedAt || undefined,
        reported_via: reportedVia || null,
        reported_by_name: reportedBy.trim() || null,
        cause: cause || null,
      })
      onCreated(created)
    } catch (err) {
      onToast(fehlertext(err, 'Garantiefall konnte nicht gespeichert werden.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(onClose, { blockWhen: () => dirty })}>
      <div className="admin-confirm-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="admin-confirm-title">Garantiefall melden</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="gf-beschrieb">Mangel *</label>
              <textarea
                id="gf-beschrieb"
                className="admin-form-input"
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Was meldet der Kunde?"
                maxLength={5000}
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="gf-datum">Gemeldet am</label>
                <input
                  id="gf-datum"
                  type="date"
                  className="admin-form-input"
                  value={reportedAt}
                  max={heute}
                  onChange={e => setReportedAt(e.target.value)}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="gf-weg">Meldeweg</label>
                <select
                  id="gf-weg"
                  className="admin-form-select"
                  value={reportedVia}
                  onChange={e => setReportedVia(e.target.value as WarrantyChannel | '')}
                >
                  <option value="">—</option>
                  {Object.entries(CHANNEL_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="gf-melder">Gemeldet von</label>
                <input
                  id="gf-melder"
                  className="admin-form-input"
                  value={reportedBy}
                  onChange={e => setReportedBy(e.target.value)}
                  maxLength={200}
                  placeholder="z.B. Frau Meier"
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="gf-ursache">Ursache (falls bekannt)</label>
                <select
                  id="gf-ursache"
                  className="admin-form-select"
                  value={cause}
                  onChange={e => setCause(e.target.value as WarrantyCause | '')}
                >
                  <option value="">—</option>
                  {Object.entries(CAUSE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            {zukunft && (
              <div style={{ fontSize: 13, color: TON_FARBE.bad }}>Das Meldedatum liegt in der Zukunft.</div>
            )}
            {hinweis && !zukunft && (
              <div style={{ fontSize: 13, color: TON_FARBE[hinweis.ton] }} data-testid="warranty-frist-hinweis">
                {hinweis.text}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Fotos und Unterlagen gehören in den Abschnitt «Fotos und Unterlagen zu Garantiefällen» im selben Reiter.
            </div>
          </div>
          <div className="admin-confirm-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={saving || !description.trim() || zukunft}
            >
              {saving ? 'Speichere…' : 'Melden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Fall-Ansicht ────────────────────────────────────────────

export function WarrantyCaseDialog({ c, onClose, onSaved, onRepairCreated, onOpenProject, onToast }: {
  c: WarrantyCase
  onClose: () => void
  onSaved: (c: WarrantyCase) => void
  onRepairCreated?: (c: WarrantyCase) => void
  onOpenProject?: (id: string) => void
  onToast: ToastFn
}) {
  const [form, setForm] = useState<CaseForm>(() => formAus(c))
  const [saving, setSaving] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)

  // Lieferanten nur, wenn die Ursache es nahelegt oder schon einer gesetzt ist:
  // die Liste gehört zum Regress, und der ist die Ausnahme (Spec §3.6).
  const zeigtLieferant = form.cause === 'material' || !!form.supplier_id
  useEffect(() => {
    if (!zeigtLieferant || suppliers !== null) return
    listSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
  }, [zeigtLieferant, suppliers])

  const changes = caseChanges(c, form)
  const dirty = Object.keys(changes).length > 0
  const set = <K extends keyof CaseForm>(k: K, v: CaseForm[K]) => setForm(prev => ({ ...prev, [k]: v }))

  async function save(status?: WarrantyCaseStatus) {
    if (saving) return
    const body: UpdateWarrantyCaseBody = status ? { ...changes, status } : changes
    if (Object.keys(body).length === 0) return
    setSaving(true)
    try {
      const updated = await updateWarrantyCase(c.id, body)
      setForm(formAus(updated))
      onSaved(updated)
    } catch (err) {
      onToast(fehlertext(err, 'Garantiefall konnte nicht gespeichert werden.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function createRepair() {
    if (saving) return
    setSaving(true)
    try {
      const res = await createWarrantyRepairProject(c.id)
      onRepairCreated?.(res.case)
    } catch (err) {
      onToast(fehlertext(err, 'Reparatur-Projekt konnte nicht angelegt werden.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const buttons = transitionButtons(c)
  const decided = !!c.decision
  const reparaturMoeglich = canCreateRepairProject(c)

  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(onClose, { blockWhen: () => dirty })}>
      <div className="admin-confirm-box" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          Garantiefall G-{c.case_no}
          <span className={`admin-badge ${CASE_STATUS_BADGE[c.status]}`}>{CASE_STATUS_LABELS[c.status]}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Gemeldet {fmtTag(c.reported_at)}{c.reported_via ? ` · ${CHANNEL_LABELS[c.reported_via]}` : ''}{c.reported_by_name ? ` · ${c.reported_by_name}` : ''}</span>
          <span>{fristHinweis(parseIsoDate(c.reported_at), c.deadline_at, c.expiry_at).text}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="gfv-beschrieb">Mangel</label>
            <textarea
              id="gfv-beschrieb"
              className="admin-form-input"
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              maxLength={5000}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="gfv-ursache">Ursache</label>
              <select
                id="gfv-ursache"
                className="admin-form-select"
                value={form.cause}
                onChange={e => set('cause', e.target.value as WarrantyCause | '')}
              >
                <option value="">—</option>
                {Object.entries(CAUSE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            {zeigtLieferant && (
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="gfv-lieferant">Lieferant</label>
                <select
                  id="gfv-lieferant"
                  className="admin-form-select"
                  value={form.supplier_id}
                  onChange={e => set('supplier_id', e.target.value)}
                >
                  <option value="">—</option>
                  {/* Der gespeicherte Lieferant bleibt wählbar, auch bevor die Liste da ist. */}
                  {form.supplier_id && !(suppliers ?? []).some(s => s.id === form.supplier_id) && (
                    <option value={form.supplier_id}>{suppliers === null ? 'Lade…' : 'Unbekannter Lieferant'}</option>
                  )}
                  {(suppliers ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="gfv-entscheid">Entscheid</label>
              <select
                id="gfv-entscheid"
                className="admin-form-select"
                value={form.decision}
                onChange={e => set('decision', e.target.value as WarrantyDecision | '')}
              >
                {/* Ein Entscheid lässt sich ersetzen, nicht zurücknehmen. */}
                {!decided && <option value="">— offen —</option>}
                {Object.entries(DECISION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="gfv-notiz">Begründung / Notiz zum Entscheid</label>
            <textarea
              id="gfv-notiz"
              className="admin-form-input"
              rows={2}
              value={form.decision_note}
              onChange={e => set('decision_note', e.target.value)}
              maxLength={5000}
            />
          </div>
          {c.decided_at && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Entschieden {c.decided_by_name ? `von ${c.decided_by_name} ` : ''}am {fmtDate(c.decided_at)}
              {c.resolved_at ? ` · behoben am ${fmtTag(c.resolved_at)}` : ''}
            </div>
          )}
        </div>

        {(c.repair_project_id || reparaturMoeglich) && (
          <div
            style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
            data-testid="warranty-repair-section"
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Reparatur-Projekt</div>
            {c.repair_project_id ? (
              onOpenProject && (
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                  onClick={() => onOpenProject(c.repair_project_id!)}
                  disabled={dirty}
                  title={dirty ? 'Erst speichern oder verwerfen' : undefined}
                >
                  Reparatur-Projekt öffnen
                </button>
              )
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  Kunde, Objekt und Kontakte kommen aus diesem Projekt. {repairProjectHint(c.decision)}
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary admin-btn-sm"
                  onClick={createRepair}
                  // Das Projekt richtet sich nach dem GESPEICHERTEN Entscheid —
                  // ein ungespeicherter im Formular würde still übergangen.
                  disabled={saving || dirty}
                  title={dirty ? 'Erst speichern oder verwerfen' : undefined}
                >
                  Reparatur-Projekt anlegen
                </button>
              </>
            )}
          </div>
        )}

        <div className="admin-confirm-actions" style={{ flexWrap: 'wrap' }}>
          {buttons.map(s => (
            <button
              key={s}
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={saving}
              onClick={() => save(s)}
            >
              {TRANSITION_LABELS[s]}
            </button>
          ))}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>
            {dirty ? 'Verwerfen' : 'Schliessen'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={saving || !dirty}
            onClick={() => save()}
          >
            {saving ? 'Speichere…' : (form.decision && form.decision !== c.decision ? 'Entscheid speichern' : 'Speichern')}
          </button>
        </div>
      </div>
    </div>
  )
}
