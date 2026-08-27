import React, { useEffect, useState } from 'react'
import { getAdminCorrections, approveCorrection, rejectCorrection, Correction } from '../../api/admin'
import { fmtDate } from '../utils/format'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { useToast, ToastHost } from '../components/useToast'

function TimeChange({ before, after, label }: { before: string | null; after: string | null; label: string }) {
  if (!after) return null
  const changed = before !== after
  return (
    <div style={{ fontSize: 12.5, marginBottom: 4 }}>
      <span style={{ color: 'var(--muted)' }}>{label}: </span>
      {changed && before ? <><span style={{ textDecoration: 'line-through', color: 'var(--muted)', marginRight: 6 }}>{before}</span></> : null}
      <span style={{ color: changed ? 'var(--success)' : 'inherit' }}>{after}</span>
    </div>
  )
}

// Die drei Bausteine unten teilen sich Tabelle und Karten-Ansicht. Getrennt
// gepflegt waeren sie eine zweite Wahrheit: wer eine Zeitangabe ergaenzt,
// muesste an zwei Stellen daran denken — und die Mobile-Variante ist die, die
// man beim Testen am Desktop nicht sieht.

/** Gewuenschte Zeiten als eine Zeile (Ein / Aus / Pause, je nur wenn gesetzt). */
function RequestedTimes({ c }: { c: Correction }) {
  return (
    <div style={{ fontSize: 13 }}>
      {c.requested_clock_in && <span>Ein: <strong>{c.requested_clock_in}</strong></span>}
      {c.requested_clock_out && <span style={{ marginLeft: 10 }}>Aus: <strong>{c.requested_clock_out}</strong></span>}
      {c.requested_break_minutes != null && c.requested_break_minutes > 0 && (
        <span style={{ marginLeft: 10 }}>Pause: <strong>{c.requested_break_minutes} Min.</strong></span>
      )}
    </div>
  )
}

function CorrectionActions({ c, acting, onApprove, onReject }: {
  c: Correction
  acting: string | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  return (
    <>
      <button
        className="admin-btn admin-btn-success admin-btn-sm"
        onClick={() => onApprove(c.id)}
        disabled={acting === c.id}
      >
        {acting === c.id ? '…' : '✓ Genehmigen'}
      </button>
      <button
        className="admin-btn admin-btn-danger admin-btn-sm"
        onClick={() => onReject(c.id)}
        disabled={acting === c.id}
      >
        {acting === c.id ? '…' : '✕ Ablehnen'}
      </button>
    </>
  )
}

/** Aufgeklappter Detailblock: Vorher/Nachher je Zeitfeld + volle Begruendung. */
function CorrectionDetail({ c }: { c: Correction }) {
  return (
    <div style={{ fontSize: 13 }}>
      <strong>Zeitänderungen</strong>
      <div style={{ marginTop: 8 }}>
        <TimeChange before={c.current_clock_in} after={c.requested_clock_in} label="Einstempeln" />
        <TimeChange before={c.current_clock_out} after={c.requested_clock_out} label="Ausstempeln" />
        {c.requested_break_minutes != null && (
          <div style={{ fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Pause: </span>
            {c.current_break_minutes != null && c.current_break_minutes !== c.requested_break_minutes && (
              <span style={{ textDecoration: 'line-through', color: 'var(--muted)', marginRight: 6 }}>
                {c.current_break_minutes} Min.
                {/* Der Ist-Wert kann eine Vermutung der Regel sein, kein Stempel.
                    Ohne diese Kennzeichnung entscheidet der Admin blind darüber,
                    ob er seiner eigenen Regel oder dem Mitarbeitenden glaubt. */}
                {(c.current_auto_break_minutes ?? 0) > 0 && ` (davon ${c.current_auto_break_minutes} automatisch)`}
              </span>
            )}
            <span style={{ color: c.current_break_minutes !== c.requested_break_minutes ? 'var(--success)' : 'inherit' }}>
              {c.requested_break_minutes} Min.
            </span>
          </div>
        )}
      </div>
      {c.reason && (
        <div style={{ marginTop: 8, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Begründung:</strong> {c.reason}
        </div>
      )}
    </div>
  )
}

export default function CorrectionsScreen({ onBadgeChange }: { onBadgeChange?: () => void }) {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)
  const isMobile = useIsMobile()

  async function load() {
    setLoading(true)
    try {
      setCorrections(await getAdminCorrections())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleApprove(id: string) {
    setActing(id)
    try {
      await approveCorrection(id)
      showToast('Korrektur genehmigt — Session aktualisiert', 'success')
      load()
      onBadgeChange?.()
    } catch {
      showToast('Fehler beim Genehmigen', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleReject(id: string) {
    setActing(id)
    try {
      await rejectCorrection(id)
      showToast('Korrektur abgelehnt', 'success')
      load()
      onBadgeChange?.()
    } catch {
      showToast('Fehler beim Ablehnen', 'error')
    } finally {
      setActing(null)
    }
  }

  const toggle = (id: string) => setExpanded(expanded === id ? null : id)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Zeitkorrekturen</div>
          <div className="admin-page-subtitle">{corrections.length} pendente Anträge</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : corrections.length === 0 ? (
          <div className="admin-table-empty" style={{ padding: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            Keine offenen Korrekturanträge
          </div>
        ) : isMobile ? (
          <AdminCardList
            items={corrections}
            keyFor={c => c.id}
            empty="Keine offenen Korrekturanträge"
            onItemClick={c => toggle(c.id)}
            renderCard={c => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title">{c.staff_name}</span>
                  <span className="admin-card-meta" style={{ marginTop: 0 }}>{fmtDate(c.session_date)}</span>
                </div>
                <div className="admin-card-meta"><RequestedTimes c={c} /></div>
                {c.reason && !(expanded === c.id) && (
                  <div className="admin-card-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.reason}
                  </div>
                )}
                {expanded === c.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <CorrectionDetail c={c} />
                  </div>
                )}
                {/* Genehmigen/Ablehnen darf die Karte nicht auf-/zuklappen. */}
                <div className="admin-card-actions" onClick={e => e.stopPropagation()}>
                  <CorrectionActions c={c} acting={acting} onApprove={handleApprove} onReject={handleReject} />
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Datum</th>
                <th>Gewünschte Zeit</th>
                <th>Begründung</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map(c => (
                // Fragment mit key: das Fragment ist das aeusserste Element der
                // Map, der key gehoert deshalb hierhin und nicht ans innere <tr>.
                <React.Fragment key={c.id}>
                  <tr onClick={() => toggle(c.id)} style={{ cursor: 'pointer' }}>
                    <td><strong>{c.staff_name}</strong></td>
                    <td>{fmtDate(c.session_date)}</td>
                    <td><RequestedTimes c={c} /></td>
                    <td style={{ color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.reason || '—'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <CorrectionActions c={c} acting={acting} onApprove={handleApprove} onReject={handleReject} />
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--surface2)', padding: '12px 20px' }}>
                        <CorrectionDetail c={c} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ToastHost toast={toast} />
    </div>
  )
}
