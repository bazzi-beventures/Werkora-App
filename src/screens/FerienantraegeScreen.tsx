import { useEffect, useState } from 'react'
import { approveAbsence, DECIDE_BLOCK_TEXT, getAdminAbsences, rejectAbsence, type Absence } from '../api/admin/absences'
import { ApiError } from '../api/client'
import { countWorkdays } from '../admin/utils/calendarHelpers'
import { BetaBadge } from '../shared/BetaBadge'

/**
 * «Ferienanträge» in der Mitarbeiter-App — docs/specs/ferien-freigabe-recht.md §3.3.
 *
 * Für ein Konto OHNE Admin-Rolle, das das Recht `absence_approve` trägt (der
 * Teamleiter): es kommt nicht in die Admin-App, soll aber Ferien freigeben.
 * Dieselben Endpoints wie der Admin-Screen, nur eine schmalere Oberfläche —
 * die Guards (`require_absence_viewer`/`_approver`) entscheiden am Server.
 */

interface Props {
  logoUrl?: string
  canton?: string
  onBack: () => void
  onLoggedOut: () => void
}

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Ferien',
  sick: 'Krankheit',
  military: 'Militärdienst',
  other: 'Sonstiges',
}

function fmtDate(iso: string): string {
  const [y, m, d] = (iso || '').split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

function dayCount(start: string, end: string, canton: string): string {
  const d = countWorkdays(start, end, canton)
  return d === 1 ? '1 Tag' : `${d} Tage`
}

export default function FerienantraegeScreen({ logoUrl, canton = 'ZH', onBack, onLoggedOut }: Props) {
  const [rows, setRows] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRows(await getAdminAbsences('requested'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setError('Die Anträge konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function decide(a: Absence, approve: boolean) {
    setActing(a.id)
    setMsg(null)
    try {
      await (approve ? approveAbsence(a.id) : rejectAbsence(a.id))
      setMsg(`${a.staff_name}: ${approve ? 'genehmigt' : 'abgelehnt'}`)
      setRows(prev => prev.filter(r => r.id !== a.id))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setMsg(err instanceof ApiError && err.message === 'own_absence'
        ? DECIDE_BLOCK_TEXT.own
        : 'Das hat nicht geklappt. Bitte erneut versuchen.')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Ferienanträge <BetaBadge /></div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      <div className="context-banner context-banner-green">
        <div className="banner-tag banner-tag-green">Freigabe</div>
        <div className="banner-text">Offene Anträge deiner Kollegen genehmigen oder ablehnen.</div>
      </div>

      <div style={{ padding: '8px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msg && <div role="status" style={{ fontSize: 13, color: 'var(--muted)' }}>{msg}</div>}
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Laden…</div>
        ) : error ? (
          <div style={{ color: 'var(--accent-red)', fontSize: 14 }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Keine offenen Anträge.</div>
        ) : rows.map(a => (
          <div key={a.id} className="menu-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ fontWeight: 600 }}>{a.staff_name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {TYPE_LABELS[a.absence_type] ?? a.absence_type} · {fmtDate(a.start_date)} – {fmtDate(a.end_date)}
              {' · '}{dayCount(a.start_date, a.end_date, canton)}
            </div>
            {a.note && <div style={{ fontSize: 13 }}>{a.note}</div>}
            {a.decide_block ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {DECIDE_BLOCK_TEXT[a.decide_block] ?? 'Keine Freigabe möglich'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ marginTop: 0 }} disabled={acting === a.id} onClick={() => void decide(a, true)}>
                  Genehmigen
                </button>
                <button className="btn-secondary" style={{ marginTop: 0 }} disabled={acting === a.id} onClick={() => void decide(a, false)}>
                  Ablehnen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
