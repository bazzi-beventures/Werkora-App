/**
 * Feature-Anfragen auf admin.werkora.ch — Spec docs/specs/feature-anfragen.md §7.
 *
 * Drei Reiter:
 *
 * - **Eingang** — jede Anfrage im Wortlaut, mit fünf Ausgängen (Spec F9):
 *   einem Feature zuordnen, ein neues daraus machen, an den Support
 *   weiterleiten, beantworten, ablehnen. Dazu «Anfrage erfassen» für alles,
 *   was per WhatsApp, Telefon oder Mail kommt (F10).
 * - **Board** — die Features in Phasen-Spalten. Eine Karte in eine andere
 *   Spalte ziehen öffnet den Phasen-Dialog, nie einen stillen Wechsel.
 * - **Auswertung** — Kacheln, Anfragen je Zeitraum und Mandant, CSV-Export
 *   (Paket 3, `FeatureAnalysis.tsx`).
 *
 * Benachrichtigt wird nur mit dem Häkchen im jeweiligen Dialog (Spec F11) —
 * an Phasenwechsel, Zwischenstand und den Triage-Ausgängen mit Antwort.
 * Die Nutzer sehen die öffentlichen Karten auf ihrer Roadmap (Paket 2). Das ist Absicht — so lässt sich der WhatsApp-Bestand
 * übertragen, bevor die erste Roadmap-Karte öffentlich wird.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AREA_LABEL,
  assignFeatureRequests,
  BOARD_PHASES,
  changeFeaturePhase,
  CHANNEL_LABEL,
  createFeature,
  createOperatorRequest,
  END_PHASES,
  fetchFeatureRequest,
  fetchFeatureRequests,
  fetchFeatures,
  fmtDay,
  IMPORTANCE_LABEL,
  PHASE_LABEL,
  searchFeatures,
  todayIso,
  triageFeatureRequest,
  TRIAGE_LABEL,
  updateFeatureRequest,
  type Channel,
  type FeatureCard,
  type FeatureRequestDetail,
  type FeatureRequestRow,
  type Importance,
  type Phase,
  type TargetInput,
  type Triage,
  type TriageAction,
} from '../../api/featureRequests'
import { listUsers } from '../tenantScopedApi'
import type { AuthUser } from '../../api/admin/users'
import { backdropCloseProps } from '../../shared/backdropClose'
import { ToastHost, useToast } from '../../admin/components/useToast'
import FeatureAnalysis from './FeatureAnalysis'
import FeatureDetailDialog from './FeatureDetailDialog'
import { AreaSelect, PhaseDialog, TargetField } from './featureParts'
import './error-logs.css'
import './support.css'
import './featureRequests.css'

type Tab = 'eingang' | 'board' | 'auswertung'
type Tenant = { id: string; name: string }

const TRIAGE_FILTERS: (Triage | '')[] = ['neu', 'zugeordnet', 'beantwortet', 'support', 'abgelehnt', '']

const ACTION_LABEL: Record<TriageAction, string> = {
  zuordnen: 'Einem Feature zuordnen',
  neues_feature: 'Neues Feature daraus',
  support: 'An den Support weiterleiten',
  beantworten: 'Beantworten (gibt es schon / Bedienfrage)',
  ablehnen: 'Ablehnen',
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

// ── Feature-Auswahl mit Suche ───────────────────────────────────────────────

function FeaturePicker({ features, value, onChange }: {
  features: FeatureCard[]
  value: string
  onChange: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<FeatureCard[] | null>(null)

  useEffect(() => {
    if (q.trim().length < 3) return
    let cancelled = false
    const t = setTimeout(() => {
      searchFeatures(q.trim())
        .then(r => { if (!cancelled) setHits(r.features) })
        .catch(() => { if (!cancelled) setHits([]) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  const options = q.trim().length >= 3 && hits ? hits : features
  return (
    <div className="fr-picker">
      <input className="admin-input" placeholder="Feature suchen (ab 3 Zeichen)" value={q}
             onChange={e => setQ(e.target.value)} aria-label="Feature suchen" />
      <select className="admin-input" value={value} onChange={e => onChange(e.target.value)}
              aria-label="Feature wählen" size={Math.min(6, Math.max(2, options.length + 1))}>
        <option value="">— Feature wählen —</option>
        {options.map(f => (
          <option key={f.id} value={f.id}>
            {f.reference} · {f.title} ({PHASE_LABEL[f.phase]}{f.visibility === 'intern' ? ', intern' : ''})
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Anfrage-Detail mit Triage ───────────────────────────────────────────────

function RequestDialog({ requestId, features, onClose, onChanged }: {
  requestId: string
  features: FeatureCard[]
  onClose: () => void
  onChanged: () => void
}) {
  const [req, setReq] = useState<FeatureRequestDetail | null>(null)
  const [action, setAction] = useState<TriageAction | ''>('')
  const [featureId, setFeatureId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newArea, setNewArea] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  // Satz an den Einreicher zustellen — vorbelegt: wer eine Antwort schreibt,
  // will in aller Regel, dass sie ankommt (F11). Abwählbar für Doppelmeldungen.
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    fetchFeatureRequest(requestId)
      .then(r => {
        if (cancelled) return
        setReq(r)
        setNote(r.internal_note ?? '')
        setNewTitle(r.title ?? '')
        setNewArea(r.area ?? '')
      })
      .catch(() => { if (!cancelled) setError('Anfrage konnte nicht geladen werden') })
    return () => { cancelled = true }
  }, [requestId])

  async function run() {
    if (!req || !action) return
    setBusy(true)
    setError(null)
    try {
      await triageFeatureRequest(req.id, {
        aktion: action,
        ...(action === 'zuordnen' ? { feature_id: featureId } : {}),
        ...(action === 'neues_feature' ? { feature: { title: newTitle.trim(), area: newArea } } : {}),
        ...(['beantworten', 'ablehnen', 'support'].includes(action) && text.trim() ? { text: text.trim() } : {}),
        ...(['beantworten', 'ablehnen', 'support'].includes(action) && req.created_by && notify ? { notify: true } : {}),
      })
      onChanged()
      onClose()
    } catch (e) {
      setError(errorText(e, 'Aktion fehlgeschlagen'))
      setBusy(false)
    }
  }

  async function saveNote() {
    if (!req) return
    try {
      await updateFeatureRequest(req.id, { internal_note: note })
      showToast('Notiz gespeichert', 'success')
    } catch {
      showToast('Notiz konnte nicht gespeichert werden', 'error')
    }
  }

  const ready = action === 'zuordnen' ? !!featureId
    : action === 'neues_feature' ? !!newTitle.trim() && !!newArea
      : action === 'beantworten' || action === 'ablehnen' ? !!text.trim()
        : action === 'support'

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <ToastHost toast={toast} />
      <div className="admin-modal fr-dialog fr-dialog-wide" onClick={e => e.stopPropagation()}
           role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title">
            {req ? `${req.reference} — ${req.tenant_name ?? req.tenant_id}` : 'Anfrage'}
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>
        {!req ? (
          <div className="admin-modal-body">{error ?? <div className="admin-spinner" />}</div>
        ) : (
          <div className="admin-modal-body fr-form">
            <dl className="fr-meta">
              <dt>Eingang</dt><dd>{fmtDay(req.created_on)}</dd>
              <dt>Von</dt>
              <dd>
                {req.created_by_name ?? '—'}{req.created_by_role ? ` (${req.created_by_role})` : ''}
                {!req.created_by && <span className="fr-muted"> · ohne Konto</span>}
              </dd>
              <dt>Quelle</dt>
              <dd>
                {req.source === 'betreiber'
                  ? `erfasst${req.source_channel ? ` (${CHANNEL_LABEL[req.source_channel]})` : ''}`
                  : `${req.app_context === 'admin' ? 'Admin' : 'Mitarbeiter-App'}${req.route ? ` · ${req.route}` : ''}`}
              </dd>
              <dt>Bereich</dt><dd>{req.area ? AREA_LABEL[req.area] ?? req.area : '—'}</dd>
              <dt>Wichtigkeit</dt><dd>{IMPORTANCE_LABEL[req.importance]}</dd>
              <dt>Zustand</dt>
              <dd>
                {TRIAGE_LABEL[req.triage]}
                {req.feature && ` · ${req.feature.reference} ${req.feature.title} (${req.feature.phase_label})`}
              </dd>
            </dl>

            {req.title && <div className="fr-quote-title">{req.title}</div>}
            {req.description && <div className="fr-quote">{req.description}</div>}
            {req.problem && (
              <>
                <div className="fr-section-title">Wofür / was klemmt heute</div>
                <div className="fr-quote">{req.problem}</div>
              </>
            )}
            {req.answer && (
              <>
                <div className="fr-section-title">Antwort an den Einreicher</div>
                <div className="fr-quote">{req.answer}</div>
              </>
            )}

            {req.similar.length > 0 && (
              <>
                <div className="fr-section-title">Ähnliche Features</div>
                <ul className="fr-similar">
                  {req.similar.map(f => (
                    <li key={f.id}>
                      <button type="button" className="fr-link"
                              onClick={() => { setAction('zuordnen'); setFeatureId(f.id) }}>
                        {f.reference} · {f.title}
                      </button>
                      <span className="fr-muted"> {PHASE_LABEL[f.phase]} · {f.tenant_count} Betriebe</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="fr-section-title">Was passiert damit?</div>
            <div className="fr-actions-list" role="radiogroup" aria-label="Ausgang">
              {req.allowed_actions.map(a => (
                <label key={a} className="fr-check">
                  <input type="radio" name="aktion" checked={action === a} onChange={() => setAction(a)} />
                  {ACTION_LABEL[a]}
                </label>
              ))}
              {!req.allowed_actions.includes('support') && req.triage !== 'support' && (
                <span className="fr-muted">Weiterleiten an den Support geht nur mit Konto.</span>
              )}
            </div>

            {action === 'zuordnen' && (
              <FeaturePicker features={features} value={featureId} onChange={setFeatureId} />
            )}
            {action === 'neues_feature' && (
              <div className="fr-inline">
                <label className="admin-form-group fr-grow">
                  <span className="admin-form-label">Titel (öffentlich — bitte neutral formulieren)</span>
                  <input className="admin-input" maxLength={120} value={newTitle}
                         onChange={e => setNewTitle(e.target.value)} />
                </label>
                <label className="admin-form-group">
                  <span className="admin-form-label">Bereich</span>
                  <AreaSelect value={newArea} onChange={setNewArea} />
                </label>
              </div>
            )}
            {(action === 'beantworten' || action === 'ablehnen' || action === 'support') && (
              <label className="admin-form-group">
                <span className="admin-form-label">
                  {action === 'support' ? 'Satz an den Einreicher (optional)' : 'Satz an den Einreicher (Pflicht)'}
                </span>
                <textarea className="admin-input" rows={3} maxLength={1000} value={text}
                          onChange={e => setText(e.target.value)}
                          placeholder={action === 'beantworten'
                            ? 'Gibt es schon: Einstellungen → Vorlagen'
                            : action === 'ablehnen' ? 'Warum nicht' : 'Das haben wir an den Support weitergegeben.'} />
              </label>
            )}
            {(action === 'beantworten' || action === 'ablehnen' || action === 'support') && (
              req.created_by ? (
                <label className="fr-check">
                  <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
                  {req.created_by_name ?? 'Einreicher'} benachrichtigen (Push + «Meine Wünsche»)
                </label>
              ) : (
                <span className="admin-form-hint">
                  Ohne Konto erfasst — der Satz wird gespeichert, aber niemandem zugestellt.
                </span>
              )
            )}

            <label className="admin-form-group">
              <span className="admin-form-label">Notiz (intern)</span>
              <div className="fr-inline">
                <input className="admin-input fr-grow" value={note} onChange={e => setNote(e.target.value)}
                       placeholder="Sieht nur der Betreiber" />
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={saveNote}>
                  Notiz speichern
                </button>
              </div>
            </label>
            {error && <div role="alert" className="fr-error">{error}</div>}
          </div>
        )}
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onClose}>Schliessen</button>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={run} disabled={busy || !ready}>
            Ausführen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Anfrage im Auftrag erfassen (Spec §7.2) ─────────────────────────────────

function CaptureDialog({ tenants, features, initialTenantId, onClose, onCreated }: {
  tenants: Tenant[]
  features: FeatureCard[]
  initialTenantId?: string
  onClose: () => void
  onCreated: (reference: string) => void
}) {
  const [tenantId, setTenantId] = useState(initialTenantId ?? '')
  const [accounts, setAccounts] = useState<AuthUser[]>([])
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<Channel | ''>('whatsapp')
  const [createdOn, setCreatedOn] = useState(() => todayIso())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [problem, setProblem] = useState('')
  const [area, setArea] = useState('')
  const [importance, setImportance] = useState<Importance>('wichtig')
  const [featureId, setFeatureId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    listUsers(tenantId)
      .then(list => { if (!cancelled) setAccounts(list) })
      .catch(() => { if (!cancelled) setAccounts([]) })
    return () => { cancelled = true }
  }, [tenantId])

  const tenantName = tenants.find(t => t.id === tenantId)?.name
  const ready = !!tenantId && (!!accountId || !!name.trim()) && !!title.trim() && !!description.trim() && !!area

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const created = await createOperatorRequest({
        tenant_id: tenantId,
        ...(accountId ? { account_id: accountId } : { created_by_name: name.trim() }),
        source_channel: channel,
        created_on: createdOn,
        title: title.trim(),
        description: description.trim(),
        ...(problem.trim() ? { problem: problem.trim() } : {}),
        area,
        importance,
        ...(featureId ? { feature_id: featureId } : {}),
      })
      onCreated(created.reference)
    } catch (e) {
      setError(errorText(e, 'Erfassen fehlgeschlagen'))
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal fr-dialog fr-dialog-wide" onClick={e => e.stopPropagation()}
           role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title">Anfrage erfassen</div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>
        <div className="admin-modal-body fr-form">
          <div className="fr-inline">
            <label className="admin-form-group fr-grow">
              <span className="admin-form-label">Mandant</span>
              <select className="admin-input" value={tenantId}
                      onChange={e => { setTenantId(e.target.value); setAccountId(''); setAccounts([]) }}>
                <option value="">— wählen —</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Kanal</span>
              <select className="admin-input" value={channel} onChange={e => setChannel(e.target.value as Channel | '')}>
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Datum</span>
              <input type="date" className="admin-input" value={createdOn} max={todayIso()}
                     onChange={e => setCreatedOn(e.target.value)} />
            </label>
          </div>
          <div className="fr-inline">
            <label className="admin-form-group fr-grow">
              <span className="admin-form-label">Konto (wenn bekannt)</span>
              <select className="admin-input" value={accountId} disabled={!tenantId}
                      onChange={e => setAccountId(e.target.value)}>
                <option value="">— ohne Konto —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.display_name || a.username} ({a.role})</option>
                ))}
              </select>
            </label>
            {!accountId && (
              <label className="admin-form-group fr-grow">
                <span className="admin-form-label">Name</span>
                <input className="admin-input" maxLength={120} value={name} onChange={e => setName(e.target.value)} />
              </label>
            )}
          </div>
          <label className="admin-form-group">
            <span className="admin-form-label">Titel — was wird gewünscht, in einem Satz</span>
            <input className="admin-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="admin-form-group">
            <span className="admin-form-label">Beschreibung (Wortlaut, so nah wie möglich)</span>
            <textarea className="admin-input" rows={4} maxLength={2000} value={description}
                      onChange={e => setDescription(e.target.value)} />
          </label>
          <label className="admin-form-group">
            <span className="admin-form-label">Wofür / was klemmt heute (optional)</span>
            <textarea className="admin-input" rows={2} maxLength={1000} value={problem}
                      onChange={e => setProblem(e.target.value)} />
          </label>
          <div className="fr-inline">
            <label className="admin-form-group fr-grow">
              <span className="admin-form-label">Bereich</span>
              <AreaSelect value={area} onChange={setArea} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Wichtigkeit</span>
              <select className="admin-input" value={importance} onChange={e => setImportance(e.target.value as Importance)}>
                {(Object.keys(IMPORTANCE_LABEL) as Importance[]).map(i => <option key={i} value={i}>{IMPORTANCE_LABEL[i]}</option>)}
              </select>
            </label>
          </div>
          <div className="admin-form-group">
            <span className="admin-form-label">Direkt einem Feature zuordnen (optional)</span>
            <FeaturePicker features={features} value={featureId} onChange={setFeatureId} />
          </div>
          {error && <div role="alert" className="fr-error">{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={submit} disabled={busy || !ready}>
            {tenantName ? `Für ${tenantName} erfassen` : 'Erfassen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Neues Feature ───────────────────────────────────────────────────────────

function NewFeatureDialog({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (f: FeatureCard) => void
}) {
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'oeffentlich' | 'intern'>('oeffentlich')
  const [phase, setPhase] = useState<Phase>('pruefung')
  const [on, setOn] = useState(() => todayIso())
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<TargetInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsReason = END_PHASES.includes(phase)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onCreated(await createFeature({
        title: title.trim(), area, visibility, phase, on, target,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(needsReason ? { public_reason: reason.trim() } : {}),
      }))
    } catch (e) {
      setError(errorText(e, 'Anlegen fehlgeschlagen'))
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal fr-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title">Neues Feature</div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>
        <div className="admin-modal-body fr-form">
          <label className="admin-form-group">
            <span className="admin-form-label">Titel (öffentlich)</span>
            <input className="admin-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="admin-form-group">
            <span className="admin-form-label">Beschreibung (öffentlich, optional)</span>
            <textarea className="admin-input" rows={3} maxLength={2000} value={description}
                      onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="fr-inline">
            <label className="admin-form-group fr-grow">
              <span className="admin-form-label">Bereich</span>
              <AreaSelect value={area} onChange={setArea} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Sichtbarkeit</span>
              <select className="admin-input" value={visibility}
                      onChange={e => setVisibility(e.target.value as 'oeffentlich' | 'intern')}>
                <option value="oeffentlich">Öffentlich</option>
                <option value="intern">Intern</option>
              </select>
            </label>
          </div>
          <div className="fr-inline">
            <label className="admin-form-group fr-grow">
              <span className="admin-form-label">Startphase</span>
              <select className="admin-input" value={phase} onChange={e => setPhase(e.target.value as Phase)}>
                {(Object.keys(PHASE_LABEL) as Phase[]).map(p => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">seit</span>
              <input type="date" className="admin-input" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} />
            </label>
          </div>
          {needsReason && (
            <label className="admin-form-group">
              <span className="admin-form-label">Öffentlicher Grund (Pflicht)</span>
              <input className="admin-input" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
            </label>
          )}
          <div className="admin-form-group">
            <span className="admin-form-label">Zielzeitraum</span>
            <TargetField value={target} onChange={setTarget} />
          </div>
          {error && <div role="alert" className="fr-error">{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={submit}
                  disabled={busy || !title.trim() || !area || (needsReason && !reason.trim())}>
            Anlegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Board ───────────────────────────────────────────────────────────────────

function FeatureCardView({ f, onOpen, onDragStart }: {
  f: FeatureCard
  onOpen: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <button type="button" className={`fr-card${f.visibility === 'intern' ? ' is-intern' : ''}`}
            draggable onDragStart={onDragStart} onClick={onOpen} title="Feature öffnen">
      <div className="fr-card-top">
        <span className="fr-muted">{f.reference} · {AREA_LABEL[f.area] ?? f.area}</span>
        {f.visibility === 'intern' && <span className="admin-badge admin-badge-draft">intern</span>}
      </div>
      <div className="fr-card-title">{f.title}</div>
      <div className="fr-card-meta">
        Ziel: {f.target_label} · seit {fmtDay(f.phase_since)}
      </div>
      <div className="fr-card-meta">
        {f.tenant_count} {f.tenant_count === 1 ? 'Betrieb' : 'Betriebe'} · {f.request_count} Anfragen
        {f.priority ? ` · P${f.priority}` : ''}{f.effort ? ` · ${f.effort}` : ''}
      </div>
    </button>
  )
}

function Board({ features, onOpen, onMove }: {
  features: FeatureCard[]
  onOpen: (id: string) => void
  onMove: (f: FeatureCard, phase: Phase) => void
}) {
  const [showEnd, setShowEnd] = useState(false)
  const byPhase = useMemo(() => {
    const map: Record<string, FeatureCard[]> = {}
    for (const f of features) (map[f.phase] ??= []).push(f)
    for (const list of Object.values(map)) {
      list.sort((a, b) => b.tenant_count - a.tenant_count || b.request_count - a.request_count)
    }
    return map
  }, [features])

  function drop(e: React.DragEvent, phase: Phase) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/feature-id')
    const f = features.find(x => x.id === id)
    if (f && f.phase !== phase) onMove(f, phase)
  }

  const column = (p: Phase) => (
    <section key={p} className="fr-column" aria-label={PHASE_LABEL[p]}
             onDragOver={e => e.preventDefault()} onDrop={e => drop(e, p)}>
      <div className="fr-column-head">
        <span className={`fr-phase fr-phase-${p}`}>{PHASE_LABEL[p]}</span>
        <span className="fr-muted">{byPhase[p]?.length ?? 0}</span>
      </div>
      {(byPhase[p] ?? []).map(f => (
        <FeatureCardView key={f.id} f={f} onOpen={() => onOpen(f.id)}
                         onDragStart={e => e.dataTransfer.setData('text/feature-id', f.id)} />
      ))}
    </section>
  )

  const endCount = END_PHASES.reduce((n, p) => n + (byPhase[p]?.length ?? 0), 0)
  return (
    <>
      <div className="fr-board">{BOARD_PHASES.map(column)}</div>
      <button type="button" className="fr-link fr-end-toggle" onClick={() => setShowEnd(v => !v)}
              aria-expanded={showEnd}>
        {showEnd ? '▾' : '▸'} Später / Nicht geplant ({endCount})
      </button>
      {showEnd && <div className="fr-board fr-board-end">{END_PHASES.map(column)}</div>}
    </>
  )
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function FeatureRequestsScreen({ initialTenantId, onCountChange }: {
  /** Mandanten-Wähler als Vorauswahl des Filters (wie Support, admin-werkora-ch §4.1). */
  initialTenantId?: string
  /** Meldet die Zahl neuer Anfragen an die Leiste (Abzeichen). */
  onCountChange?: (n: number) => void
}) {
  const [tab, setTab] = useState<Tab>('eingang')
  const [triage, setTriage] = useState<Triage | ''>('neu')
  const [tenantFilter, setTenantFilter] = useState(initialTenantId ?? '')
  const [requests, setRequests] = useState<FeatureRequestRow[]>([])
  const [newCount, setNewCount] = useState(0)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [features, setFeatures] = useState<FeatureCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkFeature, setBulkFeature] = useState('')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openFeature, setOpenFeature] = useState<string | null>(null)
  const [capture, setCapture] = useState(false)
  const [newFeature, setNewFeature] = useState(false)
  const [move, setMove] = useState<{ f: FeatureCard; phase: Phase } | null>(null)
  const { toast, showToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, board] = await Promise.all([
        fetchFeatureRequests({ triage, tenantId: tenantFilter || undefined }),
        fetchFeatures(),
      ])
      setRequests(list.requests)
      setNewCount(list.new_count)
      setTenants(list.tenants)
      setFeatures(board.features)
      setSelected([])
      onCountChange?.(list.new_count)
    } catch {
      showToast('Feature-Anfragen konnten nicht geladen werden', 'error')
    } finally {
      setLoading(false)
    }
  }, [triage, tenantFilter, showToast, onCountChange])

  useEffect(() => { load() }, [load])

  async function assignSelected() {
    if (!bulkFeature || selected.length === 0) return
    try {
      const res = await assignFeatureRequests(selected, bulkFeature)
      showToast(res.failed.length
        ? `${res.assigned.length} zugeordnet, ${res.failed.length} nicht`
        : `${res.assigned.length} zugeordnet`, res.failed.length ? 'error' : 'success')
      setBulkFeature('')
      load()
    } catch {
      showToast('Zuordnen fehlgeschlagen', 'error')
    }
  }

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="admin-page">
      <ToastHost toast={toast} />
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Feature-Anfragen</div>
          <div className="admin-page-subtitle">
            Wünsche aller Mandanten und die Roadmap. Öffentliche Karten sehen die Nutzer in ihrer Roadmap.
          </div>
        </div>
        <div className="fr-actions">
          <button className="admin-btn admin-btn-secondary" onClick={() => setNewFeature(true)}>+ Feature</button>
          <button className="admin-btn admin-btn-primary" onClick={() => setCapture(true)}>+ Anfrage erfassen</button>
        </div>
      </div>

      <div className="fr-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'eingang'} className={`fr-tab${tab === 'eingang' ? ' is-active' : ''}`}
                onClick={() => setTab('eingang')}>
          Eingang{newCount > 0 && <span className="fr-badge">{newCount}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'board'} className={`fr-tab${tab === 'board' ? ' is-active' : ''}`}
                onClick={() => setTab('board')}>
          Board ({features.length})
        </button>
        <button role="tab" aria-selected={tab === 'auswertung'} className={`fr-tab${tab === 'auswertung' ? ' is-active' : ''}`}
                onClick={() => setTab('auswertung')}>
          Auswertung
        </button>
      </div>

      {tab === 'eingang' && (
        <>
          <div className="support-filterbar">
            {TRIAGE_FILTERS.map(t => (
              <button key={t || 'alle'} className={`elog-chip${triage === t ? ' active' : ''}`}
                      aria-pressed={triage === t} onClick={() => setTriage(t)}>
                {t ? TRIAGE_LABEL[t] : 'Alle'}
                {t === 'neu' && <span className="elog-chip-count">{newCount}</span>}
              </button>
            ))}
            <label className="support-filter-tenant">
              <span>Mandant</span>
              <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
                <option value="">Alle Mandanten</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          {selected.length > 0 && (
            <div className="fr-bulk">
              <span>{selected.length} markiert →</span>
              <select className="admin-input" value={bulkFeature} onChange={e => setBulkFeature(e.target.value)}
                      aria-label="Feature für markierte Anfragen">
                <option value="">— Feature wählen —</option>
                {features.map(f => <option key={f.id} value={f.id}>{f.reference} · {f.title}</option>)}
              </select>
              <button className="admin-btn admin-btn-primary admin-btn-sm" disabled={!bulkFeature} onClick={assignSelected}>
                Zuordnen
              </button>
            </div>
          )}

          {requests.length === 0 && !loading && (
            <div className="support-empty">
              {triage === 'neu' ? 'Nichts Neues im Eingang.' : 'Keine Anfragen für diese Auswahl.'}
            </div>
          )}
          {requests.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table fr-table">
                <thead>
                  <tr>
                    <th aria-label="Markieren" />
                    <th>Nr.</th><th>Datum</th><th>Mandant</th><th>Person</th><th>Bereich</th>
                    <th>Wichtigkeit</th><th>Titel</th><th>Zustand</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} className="fr-row" onClick={() => setOpenRequest(r.id)} title="Anfrage öffnen">
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`${r.reference} markieren`}
                               checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td>{r.reference}</td>
                      <td>{fmtDay(r.created_on)}</td>
                      <td>{r.tenant_name ?? '—'}</td>
                      <td>
                        {r.created_by_name ?? '—'}
                        {r.source === 'betreiber' && r.source_channel && (
                          <span className="fr-muted"> · {CHANNEL_LABEL[r.source_channel]}</span>
                        )}
                      </td>
                      <td>{r.area ? AREA_LABEL[r.area] ?? r.area : '—'}</td>
                      <td>{IMPORTANCE_LABEL[r.importance]}</td>
                      <td>{r.origin === 'unterstuetzung' ? <i>Unterstützung</i> : r.title}</td>
                      <td>{TRIAGE_LABEL[r.triage]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'board' && (
        features.length === 0 && !loading
          ? <div className="support-empty">Noch keine Features. «+ Feature» legt das erste an.</div>
          : <Board features={features} onOpen={setOpenFeature} onMove={(f, phase) => setMove({ f, phase })} />
      )}

      {tab === 'auswertung' && (
        <FeatureAnalysis
          onShowNew={() => { setTriage('neu'); setTenantFilter(''); setTab('eingang') }}
          onPickTenant={id => { setTriage(''); setTenantFilter(id); setTab('eingang') }}
          onOpenFeature={setOpenFeature}
          notify={showToast}
        />
      )}

      {openRequest && (
        <RequestDialog requestId={openRequest} features={features}
                       onClose={() => setOpenRequest(null)} onChanged={load} />
      )}
      {openFeature && (
        <FeatureDetailDialog featureId={openFeature} features={features}
                             onClose={() => setOpenFeature(null)} onChanged={load} />
      )}
      {capture && (
        <CaptureDialog tenants={tenants} features={features} initialTenantId={tenantFilter || initialTenantId}
                       onClose={() => setCapture(false)}
                       onCreated={ref => { setCapture(false); showToast(`${ref} erfasst`, 'success'); load() }} />
      )}
      {newFeature && (
        <NewFeatureDialog onClose={() => setNewFeature(false)}
                          onCreated={f => { setNewFeature(false); showToast(`${f.reference} angelegt`, 'success'); load() }} />
      )}
      {move && (
        <PhaseDialog
          title={`${move.f.reference} → ${PHASE_LABEL[move.phase]}`}
          currentPhase={move.f.phase}
          initialPhase={move.phase}
          requestCount={move.f.request_count}
          tenantCount={move.f.tenant_count}
          isPublic={move.f.visibility !== 'intern'}
          currentTarget={move.f.target_from && move.f.target_precision
            ? { from: move.f.target_from, to: move.f.target_to ?? undefined, precision: move.f.target_precision }
            : null}
          onClose={() => setMove(null)}
          onSubmit={async body => {
            await changeFeaturePhase(move.f.id, body)
            setMove(null)
            load()
          }}
        />
      )}
    </div>
  )
}
