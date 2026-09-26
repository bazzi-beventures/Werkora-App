/**
 * Feature-Detail auf der Betreiber-Seite (Spec docs/specs/feature-anfragen.md §7.4, §7.5).
 *
 * Zwei Spalten mit Absicht: links, was Nutzer sehen (öffentlich), rechts, was
 * intern bleibt. Die Trennung ist sichtbar, weil sie die einzige Sicherung
 * dagegen ist, dass eine interne Bemerkung auf dem Board landet.
 *
 * Darunter die Anfragen im Wortlaut und die technische Zusammenfassung mit
 * Kopier-Knopf — der Block, den man in einen Prompt, ein Issue oder eine
 * Spec einfügt. Paket 3: der KI-Entwurf (editierbar, fliesst in die
 * Zusammenfassung ein) und «In WF-… aufgehen lassen» (Spec §7.1).
 */
import { useCallback, useEffect, useState } from 'react'
import {
  AREA_LABEL,
  changeFeaturePhase,
  CHANNEL_LABEL,
  END_PHASES,
  fetchFeature,
  fetchFeatureSummary,
  fmtDay,
  formatTarget,
  generateFeatureAiSummary,
  IMPORTANCE_LABEL,
  mergeFeature,
  PHASE_LABEL,
  postFeatureUpdate,
  updateFeature,
  type FeatureCard,
  type FeatureDetail,
  type HistoryEntry,
} from '../../api/featureRequests'
import { ApiError } from '../../api/client'
import { backdropCloseProps } from '../../shared/backdropClose'
import { ToastHost, useToast } from '../../admin/components/useToast'
import { copyToClipboard } from '../clipboard'
import { AreaSelect, PhaseDialog } from './featureParts'

function historyText(e: HistoryEntry): string {
  if (e.art === 'phase') return PHASE_LABEL[e.phase!] ?? String(e.phase)
  if (e.art === 'ziel') {
    const von = e.from ? formatTarget(e.from.from, e.from.to, e.from.precision) : 'ohne Ziel'
    const nach = e.to ? formatTarget(e.to.from, e.to.to, e.to.precision) : 'ohne Ziel'
    return `Ziel: ${von} → ${nach}`
  }
  return e.art === 'intern' ? 'Interner Vermerk' : 'Zwischenstand'
}

interface Props {
  featureId: string
  /** Kandidaten für «In WF-… aufgehen lassen»; ohne Liste kein Zusammenlegen. */
  features?: FeatureCard[]
  onClose: () => void
  onChanged: () => void
}

const AI_ERRORS: Record<string, string> = {
  no_requests: 'Ohne zugeordnete Anfragen gibt es nichts zusammenzufassen.',
  rate_limited: 'Stundenlimit für KI-Entwürfe erreicht — später noch einmal.',
}

const MERGE_ERRORS: Record<string, string> = {
  merge_self: 'Ein Feature kann nicht in sich selbst aufgehen.',
  merge_target_closed: 'Das Ziel ist zurückgestellt oder nicht geplant — erst dort die Phase ändern.',
}

function errorDetail(e: unknown): string {
  return e instanceof ApiError ? (e.code ?? e.message) : ''
}

export default function FeatureDetailDialog({ featureId, features = [], onClose, onChanged }: Props) {
  const [feature, setFeature] = useState<FeatureDetail | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState<string>('')
  const [updateText, setUpdateText] = useState('')
  const [updateIntern, setUpdateIntern] = useState(false)
  // Zwischenstand: Häkchen standardmässig AUS (F11) — nicht jede Notiz ist
  // eine Nachricht wert. Bei Phasenwechseln entscheidet der PhaseDialog.
  const [updateNotify, setUpdateNotify] = useState(false)
  const [phaseOpen, setPhaseOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [mergeInto, setMergeInto] = useState('')
  const [mergeConfirm, setMergeConfirm] = useState(false)
  const { toast, showToast } = useToast()

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([fetchFeature(featureId), fetchFeatureSummary(featureId)])
      setFeature(f)
      setSummary(s.text)
      setForm({
        title: f.title ?? '',
        description: f.description ?? '',
        area: f.area ?? '',
        visibility: f.visibility,
        internal_note: f.internal_note ?? '',
        ai_summary: f.ai_summary ?? '',
        priority: f.priority ? String(f.priority) : '',
        effort: f.effort ?? '',
        module_key: f.module_key ?? '',
        feature_flag_key: f.feature_flag_key ?? '',
        spec_path: f.spec_path ?? '',
        links: (f.links ?? []).map(l => `${l.label} | ${l.url}`).join('\n'),
      })
    } catch {
      showToast('Feature konnte nicht geladen werden', 'error')
    }
  }, [featureId, showToast])

  useEffect(() => { load() }, [load])

  const set = (key: string) => (e: { target: { value: string } }) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  async function save() {
    setBusy(true)
    try {
      await updateFeature(featureId, {
        title: form.title,
        description: form.description || null,
        area: form.area,
        visibility: form.visibility as 'oeffentlich' | 'intern',
        internal_note: form.internal_note || null,
        ai_summary: form.ai_summary || null,
        priority: form.priority ? Number(form.priority) : null,
        effort: form.effort || null,
        module_key: form.module_key || null,
        feature_flag_key: form.feature_flag_key || null,
        spec_path: form.spec_path || null,
        links: form.links.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
          const [label, url] = line.includes('|') ? line.split('|').map(s => s.trim()) : [line, line]
          return { label, url }
        }),
      })
      showToast('Gespeichert', 'success')
      onChanged()
      await load()
    } catch {
      showToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function postUpdate() {
    if (!updateText.trim()) return
    setBusy(true)
    try {
      await postFeatureUpdate(featureId, updateText.trim(), updateIntern, updateNotify)
      setUpdateText('')
      setUpdateNotify(false)
      showToast(updateIntern ? 'Vermerk gespeichert' : 'Zwischenstand veröffentlicht', 'success')
      await load()
    } catch {
      showToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function copy(format: 'markdown' | 'text') {
    try {
      const text = format === 'markdown' ? summary : (await fetchFeatureSummary(featureId, 'text')).text
      showToast(await copyToClipboard(text) ? 'In die Zwischenablage kopiert' : 'Kopieren nicht möglich',
                'success')
    } catch {
      showToast('Zusammenfassung konnte nicht geladen werden', 'error')
    }
  }

  async function generateAi() {
    if (form.ai_summary?.trim() && !window.confirm('Den bestehenden KI-Entwurf überschreiben?')) return
    setAiBusy(true)
    try {
      const res = await generateFeatureAiSummary(featureId)
      setForm(prev => ({ ...prev, ai_summary: res.ai_summary }))
      setSummary((await fetchFeatureSummary(featureId)).text)
      showToast('KI-Entwurf erstellt — vor Weitergabe prüfen', 'success')
    } catch (e) {
      showToast(AI_ERRORS[errorDetail(e)] ?? 'KI-Entwurf fehlgeschlagen', 'error')
    } finally {
      setAiBusy(false)
    }
  }

  async function merge() {
    if (!mergeInto) return
    setBusy(true)
    try {
      const res = await mergeFeature(featureId, mergeInto)
      showToast(`${res.moved} ${res.moved === 1 ? 'Anfrage' : 'Anfragen'} nach ${res.reference} übernommen`, 'success')
      onChanged()
      onClose()
    } catch (e) {
      showToast(MERGE_ERRORS[errorDetail(e)] ?? 'Zusammenlegen fehlgeschlagen', 'error')
      setMergeConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  const history = [...(feature?.history ?? [])].reverse()
  const mergeTargets = features.filter(f => f.id !== featureId && !END_PHASES.includes(f.phase))
  const mergeTarget = mergeTargets.find(f => f.id === mergeInto)

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <ToastHost toast={toast} />
      <div className="admin-modal fr-detail" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title">
            {feature ? `${feature.reference} — ${feature.title}` : 'Feature'}
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>

        {!feature ? (
          <div className="admin-modal-body"><div className="admin-spinner" /></div>
        ) : (
          <div className="admin-modal-body">
            <div className="fr-detail-status">
              <span className={`fr-phase fr-phase-${feature.phase}`}>{feature.phase_label}</span>
              <span>seit {fmtDay(feature.phase_since)}</span>
              <span>· Ziel: {feature.target_label}</span>
              <span>· {feature.request_count} Anfragen aus {feature.tenant_count} Betrieben</span>
              <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setPhaseOpen(true)}>
                Phase / Ziel ändern
              </button>
            </div>

            <div className="fr-detail-columns">
              <section className="fr-detail-public" aria-label="Öffentlich">
                <div className="fr-section-title">Öffentlich — steht so auf dem Board</div>
                <label className="admin-form-group">
                  <span className="admin-form-label">Titel</span>
                  <input className="admin-input" maxLength={120} value={form.title ?? ''} onChange={set('title')} />
                </label>
                <label className="admin-form-group">
                  <span className="admin-form-label">Beschreibung</span>
                  <textarea className="admin-input" rows={4} maxLength={2000}
                            value={form.description ?? ''} onChange={set('description')} />
                  <span className="admin-form-hint">Keine Namen von Personen oder Betrieben — das lesen alle.</span>
                </label>
                <label className="admin-form-group">
                  <span className="admin-form-label">Bereich</span>
                  <AreaSelect value={form.area ?? ''} onChange={v => setForm(p => ({ ...p, area: v }))} />
                </label>
                <label className="admin-form-group">
                  <span className="admin-form-label">Sichtbarkeit</span>
                  <select className="admin-input" value={form.visibility ?? 'oeffentlich'} onChange={set('visibility')}>
                    <option value="oeffentlich">Öffentlich (auf dem Board)</option>
                    <option value="intern">Intern (nur hier)</option>
                  </select>
                </label>
              </section>

              <section className="fr-detail-internal" aria-label="Intern">
                <div className="fr-section-title">Intern — sieht nur der Betreiber</div>
                <label className="admin-form-group">
                  <span className="admin-form-label">Notiz</span>
                  <textarea className="admin-input" rows={3} value={form.internal_note ?? ''} onChange={set('internal_note')} />
                </label>
                <div className="fr-inline">
                  <label className="admin-form-group">
                    <span className="admin-form-label">Priorität</span>
                    <select className="admin-input" value={form.priority ?? ''} onChange={set('priority')}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="admin-form-group">
                    <span className="admin-form-label">Aufwand</span>
                    <select className="admin-input" value={form.effort ?? ''} onChange={set('effort')}>
                      <option value="">—</option>
                      {['S', 'M', 'L', 'XL'].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
                <div className="fr-inline">
                  <label className="admin-form-group">
                    <span className="admin-form-label">Modul</span>
                    <input className="admin-input" value={form.module_key ?? ''} onChange={set('module_key')} placeholder="quotes" />
                  </label>
                  <label className="admin-form-group">
                    <span className="admin-form-label">Flag</span>
                    <input className="admin-input" value={form.feature_flag_key ?? ''} onChange={set('feature_flag_key')} />
                  </label>
                </div>
                <label className="admin-form-group">
                  <span className="admin-form-label">Spec</span>
                  <input className="admin-input" value={form.spec_path ?? ''} onChange={set('spec_path')} placeholder="docs/specs/…" />
                </label>
                <label className="admin-form-group">
                  <span className="admin-form-label">Links (je Zeile «Label | URL»)</span>
                  <textarea className="admin-input" rows={2} value={form.links ?? ''} onChange={set('links')} />
                </label>
              </section>
            </div>
            <div className="fr-actions">
              <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={save} disabled={busy}>
                Speichern
              </button>
            </div>

            <div className="fr-section-title">Verlauf</div>
            <ol className="fr-timeline">
              {history.map((e, i) => (
                <li key={`${e.on}-${i}`} className={`fr-timeline-item fr-timeline-${e.art}`}>
                  <div className="fr-timeline-head">
                    <span>{historyText(e)}</span>
                    <span className="fr-muted">{fmtDay(e.on)}{e.by ? ` · ${e.by}` : ''}</span>
                  </div>
                  {e.text && <div className="fr-timeline-text">{e.text}</div>}
                </li>
              ))}
            </ol>
            <div className="fr-update">
              <textarea className="admin-input" rows={2} maxLength={1000} value={updateText}
                        onChange={e => setUpdateText(e.target.value)}
                        placeholder={updateIntern ? 'Interner Vermerk' : 'Zwischenstand für die Nutzer'} />
              <div className="fr-actions">
                <label className="fr-check">
                  <input type="checkbox" checked={updateIntern} onChange={e => setUpdateIntern(e.target.checked)} />
                  intern
                </label>
                {!updateIntern && feature.visibility !== 'intern' && feature.request_count > 0 && (
                  <label className="fr-check">
                    <input type="checkbox" checked={updateNotify} onChange={e => setUpdateNotify(e.target.checked)} />
                    Anfragende benachrichtigen
                  </label>
                )}
                <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={postUpdate}
                        disabled={busy || !updateText.trim()}>
                  {updateIntern ? 'Vermerk speichern' : 'Zwischenstand posten'}
                </button>
              </div>
            </div>

            <div className="fr-section-title">Anfragen ({feature.requests.length})</div>
            {feature.requests.length === 0 ? (
              <div className="fr-muted">Noch keine Anfrage zugeordnet.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table fr-table">
                  <thead>
                    <tr><th>Nr.</th><th>Datum</th><th>Betrieb</th><th>Person</th><th>Wichtigkeit</th><th>Wortlaut</th></tr>
                  </thead>
                  <tbody>
                    {feature.requests.map(r => (
                      <tr key={r.id}>
                        <td>{r.reference}</td>
                        <td>{fmtDay(r.created_on)}</td>
                        <td>{r.tenant_name ?? '—'}</td>
                        <td>
                          {r.created_by_name ?? '—'}
                          {r.created_by_role ? ` (${r.created_by_role})` : ''}
                          {r.source === 'betreiber' && (
                            <span className="fr-muted"> · {r.source_channel ? CHANNEL_LABEL[r.source_channel] : 'erfasst'}</span>
                          )}
                        </td>
                        <td>{IMPORTANCE_LABEL[r.importance]}</td>
                        <td>
                          {r.origin === 'unterstuetzung' && <span className="fr-muted">Unterstützung · </span>}
                          {r.title && <b>{r.title}</b>} {r.problem || r.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="fr-section-title">
              Technische Zusammenfassung
              <span className="fr-actions fr-actions-inline">
                <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => copy('markdown')}>
                  Kopieren (Markdown)
                </button>
                <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => copy('text')}>
                  Als Text
                </button>
              </span>
            </div>
            <pre className="fr-summary" aria-label="Technische Zusammenfassung">{summary}</pre>
            <div className="fr-muted">
              Bereich: {AREA_LABEL[feature.area] ?? feature.area} · wird bei jedem Öffnen frisch gebaut.
            </div>

            <div className="fr-section-title">
              KI-Zusammenfassung (Entwurf)
              <span className="fr-actions fr-actions-inline">
                <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={generateAi}
                        disabled={aiBusy || feature.requests.length === 0}>
                  {aiBusy ? 'Erstellt …' : form.ai_summary?.trim() ? 'Neu erstellen' : 'KI-Zusammenfassung erstellen'}
                </button>
              </span>
            </div>
            <textarea className="admin-input fr-ai" rows={8} maxLength={4000} value={form.ai_summary ?? ''}
                      onChange={set('ai_summary')} aria-label="KI-Zusammenfassung"
                      placeholder="Problemstellung, gewünschtes Verhalten, Widersprüche, offene Fragen — aus den Anfragen verdichtet." />
            <div className="fr-muted">
              Die KI sieht die Anfragen nur pseudonymisiert (Person 1, Betrieb A). Änderungen mit «Speichern» oben sichern.
            </div>

            {mergeTargets.length > 0 && (
              <>
                <div className="fr-section-title">Zusammenlegen</div>
                <div className="fr-merge">
                  <select className="admin-input" value={mergeInto} aria-label="Ziel-Feature"
                          onChange={e => { setMergeInto(e.target.value); setMergeConfirm(false) }}>
                    <option value="">— In welches Feature aufgehen? —</option>
                    {mergeTargets.map(f => <option key={f.id} value={f.id}>{f.reference} · {f.title}</option>)}
                  </select>
                  {!mergeConfirm ? (
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" disabled={!mergeInto}
                            onClick={() => setMergeConfirm(true)}>
                      {mergeTarget ? `In ${mergeTarget.reference} aufgehen lassen` : 'Aufgehen lassen'}
                    </button>
                  ) : (
                    <div className="fr-merge-confirm" role="alert">
                      Alle {feature.request_count} Anfragen wandern nach {mergeTarget?.reference};
                      {' '}{feature.reference} wird «Nicht geplant — zusammengelegt mit {mergeTarget?.reference}».
                      Niemand wird benachrichtigt.
                      <span className="fr-actions">
                        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setMergeConfirm(false)}>
                          Abbrechen
                        </button>
                        <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={merge} disabled={busy}>
                          Zusammenlegen
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {phaseOpen && feature && (
        <PhaseDialog
          title={`${feature.reference} — Phase / Ziel`}
          currentPhase={feature.phase}
          initialPhase={feature.phase}
          requestCount={feature.request_count}
          tenantCount={feature.tenant_count}
          isPublic={feature.visibility !== 'intern'}
          currentTarget={feature.target_from && feature.target_precision
            ? { from: feature.target_from, to: feature.target_to ?? undefined, precision: feature.target_precision }
            : null}
          onClose={() => setPhaseOpen(false)}
          onSubmit={async body => {
            await changeFeaturePhase(featureId, body)
            setPhaseOpen(false)
            onChanged()
            await load()
          }}
        />
      )}
    </div>
  )
}
