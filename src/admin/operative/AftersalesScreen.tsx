import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  listAftersales, updateAftersales, regenerateAftersalesBody,
  sendAftersalesNow, cancelAftersales, reactivateAftersales,
  AftersalesTask, AftersalesStatus, AftersalesSnapshot,
} from '../../api/admin'
import { apiUrl } from '../../api/client'
import { fmtDate } from '../utils/format'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { useToast, ToastHost } from '../components/useToast'

type FilterKey = AftersalesStatus | 'all'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'review', label: 'Zu prüfen' },
  { key: 'scheduled', label: 'Geplant' },
  { key: 'sent', label: 'Gesendet' },
  { key: 'answered', label: 'Beantwortet' },
  { key: 'cancelled', label: 'Deaktiviert' },
  { key: 'all', label: 'Alle' },
]

const KIND_LABEL: Record<string, string> = {
  feedback: 'Feedback',
  repair_check: 'Reparatur / Service',
}

const STATUS_LABEL: Record<AftersalesStatus, string> = {
  scheduled: 'Geplant',
  review: 'Zu prüfen',
  sent: 'Gesendet',
  answered: 'Beantwortet',
  cancelled: 'Deaktiviert',
  failed: 'Fehler',
}

const STATUS_BADGE: Record<AftersalesStatus, string> = {
  scheduled: 'admin-badge-draft',
  review: 'admin-badge-warning',
  sent: 'admin-badge-info',
  answered: 'admin-badge-success',
  cancelled: 'admin-badge-draft',
  failed: 'admin-badge-danger',
}

// Status-Badge und Aktions-Knopf teilen sich Tabelle und Karten-Ansicht.
// Getrennt gepflegt driften Label und Badge-Klasse auseinander, und die
// Mobile-Variante sieht man beim Testen am Desktop nicht.
function AftersalesStatusBadge({ status }: { status: AftersalesStatus }) {
  return (
    <span className={`admin-badge ${STATUS_BADGE[status] || 'admin-badge-draft'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function OpenButton({ t, onOpen }: { t: AftersalesTask; onOpen: (t: AftersalesTask) => void }) {
  return (
    <button
      className={`admin-btn admin-btn-sm ${isEditable(t.status) ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
      onClick={e => { e.stopPropagation(); onOpen(t) }}
    >
      {isEditable(t.status) ? 'Bearbeiten' : 'Vorschau'}
    </button>
  )
}

// Geplante und zu prüfende Aufgaben lassen sich noch bearbeiten (Datum/Text/senden/
// abbrechen); gesendete/beantwortete/abgebrochene sind nur noch Vorschau.
function isEditable(status: AftersalesStatus): boolean {
  return status === 'scheduled' || status === 'review'
}

function fmtChf(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return `CHF ${n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PositionsTable({ snapshot }: { snapshot: AftersalesSnapshot | null }) {
  const items = snapshot?.items ?? []
  if (items.length === 0 && (snapshot?.total_amount === null || snapshot?.total_amount === undefined)) {
    return <div style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Positionen im Snapshot.</div>
  }
  return (
    <div className="admin-table-wrap">
    <table className="admin-table" style={{ fontSize: 13 }}>
      <thead>
        <tr><th>Position</th><th style={{ textAlign: 'right' }}>Menge</th><th style={{ textAlign: 'right' }}>Betrag</th></tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <td>{it.description}</td>
            <td style={{ textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {it.quantity != null && it.quantity !== '' ? `${it.quantity} ${it.unit ?? ''}`.trim() : ''}
            </td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtChf(it.total_price)}</td>
          </tr>
        ))}
        {snapshot?.total_amount != null && (
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>Rechnungstotal</td>
            <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtChf(snapshot.total_amount)}</td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  )
}

export default function AftersalesScreen() {
  const [tasks, setTasks] = useState<AftersalesTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('review')
  const isMobile = useIsMobile()
  const [selected, setSelected] = useState<AftersalesTask | null>(null)
  const [draft, setDraft] = useState<{ send_date: string; mail_subject: string; mail_body: string }>(
    { send_date: '', mail_subject: '', mail_body: '' },
  )
  const [busy, setBusy] = useState<'save' | 'send' | 'regen' | 'cancel' | 'reactivate' | null>(null)
  const { toast, showToast } = useToast(3500)

  async function load() {
    setLoading(true)
    try {
      setTasks(await listAftersales(filter === 'all' ? undefined : filter))
    } catch {
      showToast('Laden fehlgeschlagen.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  function openDetail(t: AftersalesTask) {
    setSelected(t)
    setDraft({
      send_date: t.send_date ?? '',
      mail_subject: t.mail_subject ?? '',
      mail_body: t.mail_body ?? '',
    })
  }

  const editable = selected != null && isEditable(selected.status)

  async function handleSave() {
    if (!selected) return
    setBusy('save')
    try {
      await updateAftersales(selected.id, {
        send_date: draft.send_date || undefined,
        mail_subject: draft.mail_subject,
        mail_body: draft.mail_body,
      })
      showToast('Gespeichert.')
      setSelected(null)
      await load()
    } catch {
      showToast('Speichern fehlgeschlagen.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleRegenerate() {
    if (!selected) return
    setBusy('regen')
    try {
      const res = await regenerateAftersalesBody(selected.id)
      setDraft(d => ({ ...d, mail_subject: res.subject, mail_body: res.body }))
      showToast('Text neu generiert.')
    } catch {
      showToast('Generierung fehlgeschlagen.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleSend() {
    if (!selected) return
    setBusy('send')
    try {
      // Erst offene Änderungen sichern, dann senden.
      if (editable) {
        await updateAftersales(selected.id, {
          send_date: draft.send_date || undefined,
          mail_subject: draft.mail_subject,
          mail_body: draft.mail_body,
        })
      }
      await sendAftersalesNow(selected.id)
      showToast('Mail gesendet.')
      setSelected(null)
      await load()
    } catch {
      showToast('Versand fehlgeschlagen.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleCancel() {
    if (!selected) return
    setBusy('cancel')
    try {
      await cancelAftersales(selected.id)
      showToast('Deaktiviert. Du kannst sie unter «Deaktiviert» wieder reaktivieren.')
      setSelected(null)
      await load()
    } catch {
      showToast('Deaktivieren fehlgeschlagen.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleReactivate() {
    if (!selected) return
    setBusy('reactivate')
    try {
      await reactivateAftersales(selected.id)
      showToast('Reaktiviert.')
      setSelected(null)
      await load()
    } catch {
      showToast('Reaktivieren fehlgeschlagen.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const reviewCount = tasks.filter(t => t.status === 'review').length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">After Sales</div>
          <div className="admin-page-subtitle">
            {tasks.length} Einträge{filter === 'review' && reviewCount > 0 ? ` · ${reviewCount} zu prüfen` : ''}
          </div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar" style={{ gap: 6 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`admin-btn admin-btn-sm ${filter === f.key ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={tasks}
            keyFor={t => String(t.id)}
            empty="Keine After-Sales-Einträge."
            onItemClick={openDetail}
            renderCard={t => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title">{t.customer_name || '—'}</span>
                  <AftersalesStatusBadge status={t.status} />
                </div>
                <div className="admin-card-meta">
                  {KIND_LABEL[t.kind] || t.kind} · {t.project_name || '—'}
                </div>
                <div className="admin-card-meta">
                  {t.positions_snapshot?.projektleiter || '—'} · Versand {fmtDate(t.send_date)}
                </div>
                {/* Knopf und Karten-Klick fuehren zum selben openDetail — das
                    stopPropagation im Knopf ist deshalb heute folgenlos und rein
                    defensiv. Sollten die beiden Pfade je auseinandergehen, ist es
                    das, was den Doppelaufruf verhindert. */}
                <div className="admin-card-actions">
                  <OpenButton t={t} onOpen={openDetail} />
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kunde</th>
                <th>Typ</th>
                <th>Projekt</th>
                <th>Projektleiter</th>
                <th>Versand am</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine After-Sales-Einträge.</td></tr>
              ) : tasks.map(t => (
                <tr key={t.id} onClick={() => openDetail(t)}>
                  <td><strong>{t.customer_name || '—'}</strong></td>
                  <td>{KIND_LABEL[t.kind] || t.kind}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.project_name || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.positions_snapshot?.projektleiter || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(t.send_date)}</td>
                  <td><AftersalesStatusBadge status={t.status} /></td>
                  <td><OpenButton t={t} onOpen={openDetail} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Vorschau-/Bearbeiten-Modal */}
      {selected && (
        <div className="admin-modal-overlay" {...backdropCloseProps(() => setSelected(null))}>
          <div className="admin-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                {KIND_LABEL[selected.kind] || selected.kind} · {selected.customer_name || '—'}
              </div>
              <button className="admin-modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Projekt: {selected.project_name || '—'}<br />
                Empfänger: {selected.customer_email || <span style={{ color: 'var(--danger, #dc2626)' }}>keine E-Mail hinterlegt</span>}
              </div>

              {selected.status === 'answered' ? (
                <div>
                  <label className="admin-form-label">Kundenantwort</label>
                  <div style={{
                    background: 'var(--surface-2, #f1f5f9)', borderRadius: 8, padding: 12,
                    fontSize: 14, whiteSpace: 'pre-wrap',
                  }}>{selected.response_text || '(ohne Text)'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    Beantwortet am {fmtDate(selected.responded_at)}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="admin-form-label">Versanddatum (automatisch)</label>
                    <input
                      className="admin-form-input"
                      type="date"
                      value={draft.send_date}
                      disabled={!editable}
                      onChange={e => setDraft(d => ({ ...d, send_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="admin-form-label">Betreff</label>
                    <input
                      className="admin-form-input"
                      value={draft.mail_subject}
                      disabled={!editable}
                      placeholder="(wird automatisch generiert)"
                      onChange={e => setDraft(d => ({ ...d, mail_subject: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="admin-form-label">Mail-Text</label>
                    <textarea
                      className="admin-form-input"
                      style={{ minHeight: 130, resize: 'vertical', fontFamily: 'inherit' }}
                      value={draft.mail_body}
                      disabled={!editable}
                      placeholder="(wird automatisch per Mistral generiert)"
                      onChange={e => setDraft(d => ({ ...d, mail_body: e.target.value }))}
                    />
                    {editable && (
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ marginTop: 8 }}
                        onClick={handleRegenerate}
                        disabled={busy != null}
                      >
                        {busy === 'regen' ? 'Generiere…' : 'Text neu generieren (Mistral)'}
                      </button>
                    )}
                  </div>
                </>
              )}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <label className="admin-form-label" style={{ margin: 0 }}>Rechnungspositionen (mitgesendet)</label>
                  {selected.invoice_id != null && (
                    <a
                      href={apiUrl(`/pwa/admin/invoices/${selected.invoice_id}/pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                    >
                      Rechnung öffnen (PDF)
                    </a>
                  )}
                </div>
                <PositionsTable snapshot={selected.positions_snapshot} />
              </div>
            </div>

            {editable && (
              <div className="admin-confirm-actions" style={{ padding: '12px 20px', borderTop: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap' }}>
                <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={handleCancel} disabled={busy != null}>
                  {busy === 'cancel' ? '…' : 'Deaktivieren'}
                </button>
                <div style={{ flex: 1 }} />
                <button className="admin-btn admin-btn-secondary" onClick={handleSave} disabled={busy != null}>
                  {busy === 'save' ? 'Speichere…' : 'Datum & Text speichern'}
                </button>
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={handleSend}
                  disabled={busy != null || !selected.customer_email}
                  title={!selected.customer_email ? 'Keine Empfänger-E-Mail hinterlegt' : undefined}
                >
                  {busy === 'send' ? 'Sende…' : 'Sofort senden'}
                </button>
              </div>
            )}

            {selected.status === 'cancelled' && (
              <div className="admin-confirm-actions" style={{ padding: '12px 20px', borderTop: '1px solid var(--border, #e2e8f0)', alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                  Diese Nachricht ist deaktiviert und wird nicht versendet.
                </div>
                <button className="admin-btn admin-btn-primary" onClick={handleReactivate} disabled={busy != null}>
                  {busy === 'reactivate' ? 'Reaktiviere…' : 'Reaktivieren'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}
