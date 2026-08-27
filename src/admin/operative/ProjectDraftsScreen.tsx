import { useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { listAllCustomers, saveCustomer } from '../../api/admin/customers'
import {
  ProjectDraft, getAdminProjectDrafts,
  convertProjectDraft, rejectProjectDraft,
} from '../../api/projectDrafts'
import { fmtDate } from '../utils/format'
import { findCustomerMatch, normalize } from './customerMatch'
import { WORK_TYPES, workTypeLabel } from '../../api/workTypes'
import { useToast, ToastHost } from '../components/useToast'

interface CustomerLite {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
}

type StatusFilter = 'open' | 'converted' | 'rejected' | 'all'

const STATUS_LABEL: Record<ProjectDraft['status'], string> = {
  open: 'Offen',
  converted: 'In Projekt umgewandelt',
  rejected: 'Verworfen',
}

const STATUS_BADGE_CLASS: Record<ProjectDraft['status'], string> = {
  open: 'admin-badge-open',
  converted: 'admin-badge-paid',
  rejected: 'admin-badge-closed',
}

interface Props {
  onBadgeChange?: () => void
}

export default function ProjectDraftsScreen({ onBadgeChange }: Props) {
  const [drafts, setDrafts] = useState<ProjectDraft[] | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [selected, setSelected] = useState<ProjectDraft | null>(null)
  const { toast, showToast } = useToast(3500)

  async function load() {
    setDrafts(null)
    try {
      const list = await getAdminProjectDrafts(filter)
      setDrafts(list)
    } catch {
      setDrafts([])
    }
  }

  useEffect(() => { load() }, [filter])

  function onConverted(p: { project_name: string }) {
    showToast(`Projekt "${p.project_name}" erstellt.`, 'success')
    setSelected(null)
    load()
    onBadgeChange?.()
  }

  function onRejected() {
    showToast('Entwurf verworfen.', 'success')
    setSelected(null)
    load()
    onBadgeChange?.()
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Projekt-Entwürfe</div>
          <div className="admin-page-subtitle">Vom Mitarbeiter beim Kunden erfasste Aufträge</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['open', 'converted', 'rejected', 'all'] as StatusFilter[]).map(s => (
            <button
              key={s}
              className={`admin-btn ${filter === s ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => setFilter(s)}
              style={{ fontSize: 13 }}
            >
              {s === 'open' ? 'Offen' : s === 'converted' ? 'Umgewandelt' : s === 'rejected' ? 'Verworfen' : 'Alle'}
            </button>
          ))}
        </div>
      </div>

      <ToastHost toast={toast} />

      {drafts === null && (
        <div className="admin-loading"><div className="admin-spinner" />Lade…</div>
      )}

      {drafts !== null && drafts.length === 0 && (
        <div className="admin-empty">Keine Entwürfe in dieser Ansicht.</div>
      )}

      {drafts !== null && drafts.length > 0 && (
        <div className="admin-list">
          {drafts.map(d => (
            <div
              key={d.id}
              className="admin-list-item clickable"
              role="button"
              tabIndex={0}
              onClick={() => setSelected(d)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(d) } }}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Kunde: {d.customer_name}
                    {d.customer_phone ? ` · ${d.customer_phone}` : ''}
                  </div>
                  {(d.object_name || d.object_address) && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {[d.object_name, d.object_address].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span className={`admin-badge ${STATUS_BADGE_CLASS[d.status]}`}>
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Erfasst von <strong style={{ color: 'var(--text)' }}>{d.created_by_name ?? '—'}</strong> · {fmtDate(d.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DraftDetailModal
          draft={selected}
          onClose={() => setSelected(null)}
          onConverted={onConverted}
          onRejected={onRejected}
        />
      )}
    </div>
  )
}

// ─── Detail-Modal mit Konvertieren / Verwerfen ─────────────

interface DetailProps {
  draft: ProjectDraft
  onClose: () => void
  onConverted: (p: { project_name: string }) => void
  onRejected: () => void
}

function DraftDetailModal({ draft, onClose, onConverted, onRejected }: DetailProps) {
  const isOpen = draft.status === 'open'
  const [projectName, setProjectName] = useState(draft.title)
  const [objectName, setObjectName] = useState(draft.object_name ?? '')
  const [objectAddress, setObjectAddress] = useState(draft.object_address ?? draft.customer_address ?? '')
  const [contactName, setContactName] = useState(draft.customer_name)
  const [contactPhone, setContactPhone] = useState(draft.customer_phone ?? '')
  // Vorbelegt mit dem, was der Mitarbeiter vor Ort angekreuzt hat — in kanonischer
  // Reihenfolge, unbekannte Alt-Werte fallen dabei raus.
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>(
    () => WORK_TYPES.map(w => w.value).filter(v => (draft.art_der_arbeit ?? []).includes(v)),
  )
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [busy, setBusy] = useState<'convert' | 'reject' | null>(null)
  const [error, setError] = useState('')

  // ── Kunden-Verknüpfung ──
  const [customers, setCustomers] = useState<CustomerLite[] | null>(null)
  const [customerMode, setCustomerMode] = useState<'existing' | 'new' | 'none'>('new')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [newCustName, setNewCustName] = useState(draft.customer_name)
  const [newCustPhone, setNewCustPhone] = useState(draft.customer_phone ?? '')
  const [newCustEmail, setNewCustEmail] = useState(draft.customer_email ?? '')
  const [newCustAddress, setNewCustAddress] = useState(draft.customer_address ?? '')
  const [customerSearch, setCustomerSearch] = useState('')

  useEffect(() => {
    if (!isOpen) return
    listAllCustomers()
      .then(list => {
        setCustomers(list)
        // Nur der exakt gleiche Name wird vorausgewählt. Ein bloss ähnlicher
        // Treffer erscheint als Vorschlagsbanner und braucht einen Klick —
        // ein still verknüpfter falscher Kunde landet sonst auf der Rechnung.
        const match = findCustomerMatch(draft.customer_name, list)
        if (match?.exact) {
          setCustomerMode('existing')
          setSelectedCustomerId(match.customer.id)
          setCustomerSearch(match.customer.name)
        }
      })
      .catch(() => setCustomers([]))
  }, [isOpen, draft.customer_name])

  const filteredCustomers = useMemo(() => {
    if (!customers) return []
    const q = normalize(customerSearch)
    if (!q) return customers.slice(0, 50)
    return customers.filter(c => normalize(c.name).includes(q)).slice(0, 50)
  }, [customers, customerSearch])

  const fuzzyMatch = useMemo(
    () => customers ? findCustomerMatch(draft.customer_name, customers)?.customer ?? null : null,
    [customers, draft.customer_name],
  )

  function toggleArt(value: string) {
    setArtDerArbeit(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value],
    )
  }

  async function handleConvert() {
    setError('')
    if (!projectName.trim()) { setError('Projektname ist erforderlich.'); return }

    let customerId: string | null = null

    if (customerMode === 'existing') {
      if (!selectedCustomerId) { setError('Bitte einen Kunden aus dem Stamm wählen.'); return }
      customerId = selectedCustomerId
    } else if (customerMode === 'new') {
      if (!newCustName.trim()) { setError('Name des neuen Kunden ist erforderlich.'); return }
    }

    setBusy('convert')
    try {
      // Bei 'new' zuerst Kunde anlegen, dann ID weiterreichen
      if (customerMode === 'new') {
        const newCust = await saveCustomer({
          name: newCustName.trim(),
          email: newCustEmail.trim() || null,
          phone: newCustPhone.trim() || null,
          address: newCustAddress.trim() || null,
        })
        customerId = newCust.id
      }

      const res = await convertProjectDraft(draft.id, {
        project_name: projectName.trim(),
        customer_id: customerId,
        object_name: objectName.trim() || null,
        object_address: objectAddress.trim() || null,
        site_contact_name: contactName.trim() || null,
        site_contact_phone: contactPhone.trim() || null,
        art_der_arbeit: WORK_TYPES.map(w => w.value).filter(v => artDerArbeit.includes(v)),
      })
      onConverted({ project_name: res.project_name })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Konvertieren.')
    } finally {
      setBusy(null)
    }
  }

  async function handleReject() {
    setError('')
    setBusy('reject')
    try {
      await rejectProjectDraft(draft.id, rejectNote.trim() || null)
      onRejected()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Verwerfen.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Projekt-Entwurf</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Erfasst von <strong>{draft.created_by_name ?? '—'}</strong> · {fmtDate(draft.created_at)}
            </div>
            <span className={`admin-badge ${STATUS_BADGE_CLASS[draft.status]}`}>
              {STATUS_LABEL[draft.status]}
            </span>
          </div>

          {/* Original-Daten des Mitarbeiters */}
          <DraftInfoBlock label="Kunde (vom Mitarbeiter erfasst)">
            <div><strong>{draft.customer_name}</strong></div>
            {draft.customer_phone && <div>Tel: {draft.customer_phone}</div>}
            {draft.customer_email && <div>E-Mail: {draft.customer_email}</div>}
            {draft.customer_address && <div>Adresse: {draft.customer_address}</div>}
          </DraftInfoBlock>

          {draft.description && (
            <DraftInfoBlock label="Beschreibung">{draft.description}</DraftInfoBlock>
          )}

          {(draft.art_der_arbeit?.length ?? 0) > 0 && (
            <DraftInfoBlock label="Art der Arbeit (vom Mitarbeiter erfasst)">
              {(draft.art_der_arbeit ?? []).map(v => workTypeLabel(v)).join(', ')}
            </DraftInfoBlock>
          )}

          {draft.materials.length > 0 && (
            <DraftInfoBlock label="Materialien">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {draft.materials.map((m, i) => (
                  <li key={i}>{m.name}{m.quantity ? ` (${m.quantity})` : ''}</li>
                ))}
              </ul>
            </DraftInfoBlock>
          )}

          {draft.notes && (
            <DraftInfoBlock label="Notizen">{draft.notes}</DraftInfoBlock>
          )}

          {draft.status === 'converted' && draft.converted_to_project_id && (
            <div className="admin-info-banner">
              Wurde in ein Projekt umgewandelt (ID: {draft.converted_to_project_id}).
            </div>
          )}

          {draft.status === 'rejected' && (
            <div className="admin-info-banner">
              Verworfen{draft.decision_note ? ` — Grund: ${draft.decision_note}` : ''}.
            </div>
          )}

          {/* Konvertieren-Formular */}
          {isOpen && !rejectMode && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>In Projekt umwandeln</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Projektname *</span>
                    <input
                      type="text"
                      className="admin-input"
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Objekt-Name (optional)</span>
                    <input
                      type="text"
                      className="admin-input"
                      value={objectName}
                      onChange={e => setObjectName(e.target.value)}
                      placeholder="z.B. MFH Sonnhalde"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Objekt-Adresse</span>
                    <input
                      type="text"
                      className="admin-input"
                      value={objectAddress}
                      onChange={e => setObjectAddress(e.target.value)}
                    />
                  </label>
                  <div className="admin-form-row">
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>Ansprechpartner vor Ort</span>
                      <input
                        type="text"
                        className="admin-input"
                        value={contactName}
                        onChange={e => setContactName(e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>Telefon</span>
                      <input
                        type="text"
                        className="admin-input"
                        value={contactPhone}
                        onChange={e => setContactPhone(e.target.value)}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Art der Arbeit (Mehrfachauswahl)</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                      {WORK_TYPES.map(t => {
                        const active = artDerArbeit.includes(t.value)
                        return (
                          <label
                            key={t.value}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                              fontSize: 13, padding: '4px 10px', borderRadius: 'var(--radius-xs)',
                              background: active ? 'var(--primary)' : 'var(--surface-2)',
                              color: active ? '#fff' : 'var(--text)',
                              border: '1px solid', borderColor: active ? 'var(--primary)' : 'var(--border)',
                            }}
                          >
                            <input
                              type="checkbox"
                              style={{ display: 'none' }}
                              checked={active}
                              onChange={() => toggleArt(t.value)}
                            />
                            {t.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Kunden-Verknüpfung ── */}
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12, marginTop: 4 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Kunde</div>

                    {fuzzyMatch && customerMode !== 'existing' && (
                      <div
                        style={{
                          background: 'var(--accent-amber-dim, rgba(245,158,11,0.12))',
                          border: '1px solid rgba(245,158,11,0.4)',
                          borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                          fontSize: 12, marginBottom: 8,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setCustomerMode('existing')
                          setSelectedCustomerId(fuzzyMatch.id)
                          setCustomerSearch(fuzzyMatch.name)
                        }}
                      >
                        💡 Möglicher Treffer im Kundenstamm: <strong>{fuzzyMatch.name}</strong>
                        {fuzzyMatch.address ? ` — ${fuzzyMatch.address}` : ''} — klicken zum Übernehmen
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      {(['existing', 'new', 'none'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          className={`admin-btn ${customerMode === mode ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          onClick={() => setCustomerMode(mode)}
                        >
                          {mode === 'existing' ? 'Aus Stamm wählen' : mode === 'new' ? 'Neuen Kunden anlegen' : 'Ohne Kunde'}
                        </button>
                      ))}
                    </div>

                    {customerMode === 'existing' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          className="admin-input"
                          placeholder="Kunden suchen…"
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                        />
                        <select
                          className="admin-input"
                          size={Math.min(6, Math.max(3, filteredCustomers.length || 3))}
                          value={selectedCustomerId}
                          onChange={e => {
                            setSelectedCustomerId(e.target.value)
                            const c = filteredCustomers.find(x => x.id === e.target.value)
                            if (c) setCustomerSearch(c.name)
                          }}
                          style={{ height: 'auto' }}
                        >
                          {customers === null && <option>Lade Kunden…</option>}
                          {customers !== null && filteredCustomers.length === 0 && (
                            <option disabled>Keine Treffer</option>
                          )}
                          {filteredCustomers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.address ? ` — ${c.address}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {customerMode === 'new' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Vorausgefüllt aus dem Entwurf — bei Bedarf vor dem Anlegen korrigieren.
                        </div>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>Name *</span>
                          <input
                            type="text"
                            className="admin-input"
                            value={newCustName}
                            onChange={e => setNewCustName(e.target.value)}
                          />
                        </label>
                        <div className="admin-form-row">
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span>Telefon</span>
                            <input
                              type="text"
                              className="admin-input"
                              value={newCustPhone}
                              onChange={e => setNewCustPhone(e.target.value)}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span>E-Mail</span>
                            <input
                              type="email"
                              className="admin-input"
                              value={newCustEmail}
                              onChange={e => setNewCustEmail(e.target.value)}
                            />
                          </label>
                        </div>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>Adresse</span>
                          <input
                            type="text"
                            className="admin-input"
                            value={newCustAddress}
                            onChange={e => setNewCustAddress(e.target.value)}
                          />
                        </label>
                      </div>
                    )}

                    {customerMode === 'none' && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Projekt wird ohne Kunden-Verknüpfung erstellt. Kunden-Infos aus dem Entwurf werden als Bemerkung übernommen.
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Materialien und Notizen werden als Bemerkung ins Projekt übernommen.
                  </div>
                </div>
              </div>

              {error && <div className="admin-error">{error}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="admin-btn admin-btn-primary"
                  style={{ flex: 1 }}
                  disabled={busy !== null}
                  onClick={handleConvert}
                >
                  {busy === 'convert' ? 'Erstelle…' : 'Projekt erstellen'}
                </button>
                <button
                  className="admin-btn admin-btn-secondary"
                  disabled={busy !== null}
                  onClick={() => setRejectMode(true)}
                >
                  Verwerfen
                </button>
              </div>
            </>
          )}

          {/* Verwerfen-Modus */}
          {isOpen && rejectMode && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Entwurf verwerfen</div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>Grund (optional)</span>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="z. B. Kunde hat abgesagt"
                  />
                </label>
              </div>
              {error && <div className="admin-error">{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="admin-btn admin-btn-secondary"
                  style={{ flex: 1 }}
                  disabled={busy !== null}
                  onClick={() => setRejectMode(false)}
                >
                  Zurück
                </button>
                <button
                  className="admin-btn"
                  style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
                  disabled={busy !== null}
                  onClick={handleReject}
                >
                  {busy === 'reject' ? 'Verwerfe…' : 'Endgültig verwerfen'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DraftInfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface-elevated, rgba(255,255,255,0.03))',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
}
