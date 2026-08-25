import { useEffect, useRef, useState } from 'react'
import {
  zeitAction,
  ZeitAction,
  submitCorrectionRequest,
  getCorrectionStatus,
  CorrectionPayload,
  createAbsenceRequest,
  fetchVacationEntitlement,
  AbsenceCreatePayload,
  VacationEntitlement,
} from '../../api/chat'
import { apiFetch, ApiError, isOfflineError } from '../../api/client'
import { UserInfo } from '../../api/auth'
import { breakInputValue, correctionError, correctionIncomplete, parseBreakMinutes } from '../../api/correction'
import BerichtScreen, { BerichtType } from '../../screens/BerichtScreen'
import { useToast, ToastHost } from '../components/useToast'

interface SessionStatus {
  status: 'active' | 'inactive' | 'on_break'
  clock_in: string | null
  since_minutes: number
}

function formatClockIn(isoUtc: string): string {
  const dt = new Date(isoUtc)
  return dt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
}

const today = () => new Date().toISOString().slice(0, 10)

const ABSENCE_TYPE_LABELS: Record<AbsenceCreatePayload['absence_type'], string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  military: 'Militärdienst',
  other: 'Sonstiges',
}

const STEMPEL_STATE_KEY = 'my-time-stempel-state'
type StempelState = {
  clockedIn: boolean
  startedAt: number | null
  onBreak: boolean
  breakStartedAt: number | null
}
const DEFAULT_STEMPEL_STATE: StempelState = {
  clockedIn: false,
  startedAt: null,
  onBreak: false,
  breakStartedAt: null,
}

function loadStempelState(): StempelState {
  try {
    const raw = localStorage.getItem(STEMPEL_STATE_KEY)
    if (!raw) return DEFAULT_STEMPEL_STATE
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STEMPEL_STATE, ...parsed }
  } catch {
    return DEFAULT_STEMPEL_STATE
  }
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const IconPlay = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
  </svg>
)
const IconStop = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <rect x="9" y="9" width="6" height="6" fill="currentColor" />
  </svg>
)
const IconPause = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="5" width="4" height="14" />
    <rect x="14" y="5" width="4" height="14" />
  </svg>
)
const IconPauseEnd = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="8 5 19 12 8 19 8 5" />
  </svg>
)
const IconReport = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <polyline points="8 13 12 17 16 13" />
    <line x1="12" y1="17" x2="12" y2="9" />
  </svg>
)
const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)
const IconCalendarLast = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <polyline points="8 14 10 16 8 18" />
  </svg>
)
const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const IconEdit = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

interface Props {
  // Nur für die Feature-Flags (automatischer Pausenabzug) — der Screen selbst
  // arbeitet weiterhin mit dem eingeloggten Konto des API-Aufrufs.
  user?: UserInfo | null
  onLoggedOut: () => void
}

interface ActionCard {
  label: string
  sub: string
  icon: React.ReactNode
  iconClass: string
  onClick: () => void
  disabled?: boolean
}

export default function MyTimeScreen({ user = null, onLoggedOut }: Props) {
  const [loadingAction, setLoadingAction] = useState<ZeitAction | null>(null)
  const { toast, showToast } = useToast(4000)
  const [stempel, setStempel] = useState<StempelState>(() => loadStempelState())
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
  const [berichtModal, setBerichtModal] = useState<BerichtType | null>(null)

  useEffect(() => {
    try { localStorage.setItem(STEMPEL_STATE_KEY, JSON.stringify(stempel)) } catch { /* ignore */ }
  }, [stempel])

  useEffect(() => {
    let cancelled = false
    async function fetchStatus() {
      if (!navigator.onLine) return
      try {
        const data = await apiFetch('/pwa/status') as SessionStatus
        if (!cancelled) {
          setSessionStatus(data)
          setStempel(s => ({
            ...s,
            clockedIn: data.status !== 'inactive',
            onBreak: data.status === 'on_break',
          }))
        }
      } catch (err) {
        if (cancelled) return
        if (isOfflineError(err)) return
        if (err instanceof ApiError && err.status === 401) onLoggedOut()
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  async function refreshStatus() {
    if (!navigator.onLine) return
    try {
      const data = await apiFetch('/pwa/status') as SessionStatus
      setSessionStatus(data)
      setStempel(s => ({
        ...s,
        clockedIn: data.status !== 'inactive',
        onBreak: data.status === 'on_break',
      }))
    } catch {
      /* ignore */
    }
  }

  const [showCorrection, setShowCorrection] = useState(false)
  const [corrForm, setCorrForm] = useState<CorrectionPayload>({
    date: today(),
    clock_in: '',
    clock_out: '',
    break_minutes: 0,
    reason: '',
  })
  const [corrLoading, setCorrLoading] = useState(false)
  // Siehe api/correction.ts: eine Pause länger als die Anwesenheit landet sonst
  // als 0-Minuten-Tag in der Session, ohne Fehlermeldung.
  const corrError = correctionError(corrForm)
  const [pendingCorrection, setPendingCorrection] = useState<{ id: string; date: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [showAbsence, setShowAbsence] = useState(false)
  const [absForm, setAbsForm] = useState<AbsenceCreatePayload>({
    absence_type: 'vacation',
    date_start: today(),
    date_end: today(),
    comment: '',
  })
  const [absLoading, setAbsLoading] = useState(false)
  const [entitlement, setEntitlement] = useState<VacationEntitlement | null>(null)

  function toggleAbsence() {
    setShowAbsence(v => {
      const next = !v
      if (next && !entitlement) {
        fetchVacationEntitlement().then(setEntitlement).catch(() => { /* optional */ })
      }
      return next
    })
  }

  async function handleAbsenceSubmit() {
    if (!absForm.date_start || !absForm.date_end) return
    if (absForm.date_end < absForm.date_start) {
      showToast('Enddatum muss nach dem Startdatum liegen.', 'error')
      return
    }
    setAbsLoading(true)
    try {
      await createAbsenceRequest(absForm)
      showToast(`${ABSENCE_TYPE_LABELS[absForm.absence_type]} wurde eingereicht.`, 'success')
      setShowAbsence(false)
      setAbsForm({ absence_type: 'vacation', date_start: today(), date_end: today(), comment: '' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      showToast(
        isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Einreichen',
        'error',
      )
    } finally {
      setAbsLoading(false)
    }
  }

  useEffect(() => {
    if (!pendingCorrection) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    const check = async () => {
      try {
        const s = await getCorrectionStatus(pendingCorrection.id)
        if (s.status === 'approved') {
          showToast(`Korrektur für ${pendingCorrection.date} genehmigt`, 'success')
          setPendingCorrection(null)
        } else if (s.status === 'rejected') {
          const note = s.review_note ? ` Grund: ${s.review_note}` : ''
          showToast(`Korrektur für ${pendingCorrection.date} abgelehnt.${note}`, 'error')
          setPendingCorrection(null)
        }
      } catch {
        /* nächstes Intervall */
      }
    }
    check()
    pollRef.current = setInterval(check, 15000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [pendingCorrection])

  async function sendAction(action: ZeitAction, opts: { art_der_arbeit?: string } = {}) {
    setLoadingAction(action)
    try {
      const res = await zeitAction(action, { recorded_at: new Date().toISOString(), ...opts })
      showToast(res.reply, 'success')
      if (action === 'clock_in')     setStempel({ clockedIn: true, startedAt: Date.now(), onBreak: false, breakStartedAt: null })
      if (action === 'clock_out')    setStempel({ clockedIn: false, startedAt: null, onBreak: false, breakStartedAt: null })
      if (action === 'start_break')  setStempel(s => ({ ...s, onBreak: true, breakStartedAt: Date.now() }))
      if (action === 'end_break')    setStempel(s => ({ ...s, onBreak: false, breakStartedAt: null }))
      refreshStatus()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      showToast(
        isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Senden',
        'error',
      )
    } finally {
      setLoadingAction(null)
    }
  }

  function handlePrimary() {
    if (loadingAction) return
    sendAction(stempel.clockedIn ? 'clock_out' : 'clock_in')
  }

  function handlePauseToggle() {
    if (loadingAction || !stempel.clockedIn) return
    sendAction(stempel.onBreak ? 'end_break' : 'start_break')
  }

  async function handleCorrectionSubmit() {
    if (correctionIncomplete(corrForm) || correctionError(corrForm) !== null) return
    setCorrLoading(true)
    try {
      const res = await submitCorrectionRequest(corrForm)
      showToast(res.reply, res.action_taken ? 'success' : 'info')
      if (res.correction_id) {
        setPendingCorrection({ id: res.correction_id, date: corrForm.date })
      }
      setShowCorrection(false)
      setCorrForm({ date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      let msg = 'Fehler beim Einreichen'
      if (isOfflineError(err)) msg = 'Keine Internetverbindung'
      else if (err instanceof ApiError && err.status === 409 && err.message === 'absence_on_date') {
        msg = 'Für diesen Tag ist bereits eine Absenz genehmigt — keine Zeitkorrektur möglich.'
      }
      // 400 trägt vom Endpoint bereits deutschen Klartext (unplausible Zeiten).
      // Einzige Ausnahme: `no_staff_linked` ist ein Code, keine Meldung.
      else if (err instanceof ApiError && err.status === 400) {
        msg = err.message === 'no_staff_linked'
          ? 'Dein Konto ist keinem Mitarbeiter zugeordnet. Bitte beim Vorgesetzten melden.'
          : err.message
      }
      showToast(msg, 'error')
    } finally {
      setCorrLoading(false)
    }
  }

  const reportCards: ActionCard[] = [
    {
      label: 'Monatsbericht',
      sub: 'Monatszeiten & Überstunden',
      icon: <IconReport />,
      iconClass: 'green',
      onClick: () => setBerichtModal('monthly'),
    },
    {
      label: 'Diese Woche',
      sub: 'Stundenjournal aktuell',
      icon: <IconCalendar />,
      iconClass: 'blue',
      onClick: () => setBerichtModal('weekly-this'),
    },
    {
      label: 'Letzte Woche',
      sub: 'Stundenjournal vergangen',
      icon: <IconCalendarLast />,
      iconClass: 'blue',
      onClick: () => setBerichtModal('weekly-last'),
    },
  ]

  const moreCards: ActionCard[] = [
    {
      label: 'Absenz beantragen',
      sub: 'Urlaub, Krankheit oder Sonstiges',
      icon: <IconUsers />,
      iconClass: 'orange',
      onClick: toggleAbsence,
    },
    {
      label: 'Arbeitszeit korrigieren',
      sub: 'Korrekturantrag einreichen',
      icon: <IconEdit />,
      iconClass: 'orange',
      onClick: () => setShowCorrection(v => !v),
    },
  ]

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Meine Zeiterfassung</div>
          <div className="admin-page-subtitle">Ein-/Ausstempeln, Pausen, Berichte und Korrekturen für dich persönlich.</div>
        </div>
      </div>

      {pendingCorrection && (
        <div
          style={{
            background: 'var(--warning-soft)',
            border: '1px solid var(--warning)',
            color: 'var(--warning)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--s-3) var(--s-4)',
            marginBottom: 'var(--s-4)',
            fontSize: 13,
          }}
        >
          Korrekturantrag für {pendingCorrection.date} eingereicht – warte auf Genehmigung…
        </div>
      )}

      {/* Hero-Stempelkarte */}
      <div className="admin-kpi-card" style={{ cursor: 'default', marginBottom: 'var(--s-5)', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="admin-kpi-label">
              {stempel.clockedIn
                ? (stempel.onBreak ? 'In Pause seit' : 'Eingestempelt um')
                : 'Ausgestempelt'}
            </div>
            <div
              className="admin-kpi-value"
              style={{
                fontFamily: 'var(--mono)',
                color: stempel.clockedIn
                  ? (stempel.onBreak ? 'var(--warning)' : 'var(--success)')
                  : 'var(--text-muted)',
                marginTop: 4,
              }}
            >
              {stempel.clockedIn
                ? (stempel.onBreak && stempel.breakStartedAt
                    ? formatClock(stempel.breakStartedAt)
                    : sessionStatus?.clock_in
                      ? formatClockIn(sessionStatus.clock_in)
                      : stempel.startedAt
                        ? formatClock(stempel.startedAt)
                        : '--:--')
                : '--:--'}
            </div>
          </div>
          <div
            className={`admin-kpi-icon ${stempel.clockedIn ? 'green' : 'blue'}`}
            style={{ width: 56, height: 56 }}
          >
            {stempel.clockedIn ? <IconStop /> : <IconPlay />}
          </div>
        </div>
      </div>

      {/* Primäre Stempel-Aktionen */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)', marginBottom: 'var(--s-6)' }}>
        <button
          className={`admin-btn admin-btn-hero ${stempel.clockedIn ? 'admin-btn-danger' : 'admin-btn-success'}`}
          onClick={handlePrimary}
          disabled={loadingAction !== null}
          style={{ minWidth: 220 }}
        >
          {stempel.clockedIn ? <IconStop /> : <IconPlay />}
          {loadingAction === 'clock_in' || loadingAction === 'clock_out'
            ? '…'
            : (stempel.clockedIn ? 'Ausstempeln' : 'Einstempeln')}
        </button>

        <button
          className="admin-btn admin-btn-secondary"
          onClick={handlePauseToggle}
          disabled={loadingAction !== null || !stempel.clockedIn}
          style={{ padding: 'var(--s-3) var(--s-5)' }}
          title={stempel.clockedIn ? undefined : 'Zuerst einstempeln'}
        >
          {stempel.onBreak ? <IconPauseEnd /> : <IconPause />}
          {loadingAction === 'start_break' || loadingAction === 'end_break'
            ? '…'
            : (stempel.onBreak ? 'Pause beenden' : 'Pause starten')}
        </button>
      </div>

      {/* Berichte */}
      <div className="admin-kpi-section">
        <div className="admin-kpi-group-title">Berichte</div>
        <div className="admin-kpi-grid">
          {reportCards.map(card => (
            <div key={card.label} className="admin-kpi-card" onClick={card.onClick}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <div className={`admin-kpi-icon ${card.iconClass}`}>{card.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{card.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{card.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weitere Aktionen */}
      <div className="admin-kpi-section">
        <div className="admin-kpi-group-title">Weitere Aktionen</div>
        <div className="admin-kpi-grid">
          {moreCards.map(card => (
            <div key={card.label} className="admin-kpi-card" onClick={card.onClick}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <div className={`admin-kpi-icon ${card.iconClass}`}>{card.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{card.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{card.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Korrekturantrag-Formular */}
      {showCorrection && (
        <div style={{ maxWidth: 520, marginTop: 'var(--s-4)' }}>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--s-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-3)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="admin-form-group">
              <label className="admin-form-label">Datum</label>
              <input
                className="admin-form-input"
                type="date"
                value={corrForm.date}
                onChange={e => setCorrForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Einstempel</label>
                <input
                  className="admin-form-input"
                  type="time"
                  value={corrForm.clock_in}
                  onChange={e => setCorrForm(f => ({ ...f, clock_in: e.target.value }))}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Ausstempel</label>
                <input
                  className="admin-form-input"
                  type="time"
                  value={corrForm.clock_out}
                  onChange={e => setCorrForm(f => ({ ...f, clock_out: e.target.value }))}
                />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Pause (Min)</label>
              <input
                className="admin-form-input"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={breakInputValue(corrForm.break_minutes)}
                onChange={e => setCorrForm(f => ({ ...f, break_minutes: parseBreakMinutes(e.target.value) }))}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Grund</label>
              <input
                className="admin-form-input"
                type="text"
                placeholder="Vergessen einzustempeln, etc."
                value={corrForm.reason}
                onChange={e => setCorrForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {corrError && <div className="admin-form-error">{corrError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setShowCorrection(false)}
                disabled={corrLoading}
              >
                Abbrechen
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleCorrectionSubmit}
                disabled={corrLoading || correctionIncomplete(corrForm) || corrError !== null}
              >
                {corrLoading ? '…' : 'Einreichen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Absenz-Antrag-Formular */}
      {showAbsence && (
        <div style={{ maxWidth: 520, marginTop: 'var(--s-4)' }}>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--s-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-3)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {entitlement && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Resturlaub</div>
                  <div style={{ fontWeight: 700, color: entitlement.remaining < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {entitlement.remaining} d
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Anspruch</div>
                  <div style={{ fontWeight: 700 }}>{entitlement.entitlement} d</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Bezogen</div>
                  <div style={{ fontWeight: 700 }}>{entitlement.taken} d</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Geplant</div>
                  <div style={{ fontWeight: 700 }}>{entitlement.planned} d</div>
                </div>
              </div>
            )}
            <div className="admin-form-group">
              <label className="admin-form-label">Typ</label>
              <select
                className="admin-form-input"
                value={absForm.absence_type}
                onChange={e => setAbsForm(f => ({ ...f, absence_type: e.target.value as AbsenceCreatePayload['absence_type'] }))}
              >
                <option value="vacation">Urlaub</option>
                <option value="sick">Krankheit</option>
                <option value="military">Militärdienst</option>
                <option value="other">Sonstiges</option>
              </select>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Von</label>
                <input
                  className="admin-form-input"
                  type="date"
                  value={absForm.date_start}
                  onChange={e => setAbsForm(f => ({ ...f, date_start: e.target.value }))}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Bis</label>
                <input
                  className="admin-form-input"
                  type="date"
                  value={absForm.date_end}
                  onChange={e => setAbsForm(f => ({ ...f, date_end: e.target.value }))}
                />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Bemerkung</label>
              <input
                className="admin-form-input"
                type="text"
                placeholder="Optional"
                value={absForm.comment}
                onChange={e => setAbsForm(f => ({ ...f, comment: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setShowAbsence(false)}
                disabled={absLoading}
              >
                Abbrechen
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleAbsenceSubmit}
                disabled={absLoading || !absForm.date_start || !absForm.date_end}
              >
                {absLoading ? '…' : 'Einreichen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bericht-Modal (Mitarbeiter-Ansicht) */}
      {berichtModal && (
        <div
          className="admin-bericht-modal-backdrop"
          onClick={() => setBerichtModal(null)}
        >
          <div
            className="admin-bericht-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="admin-bericht-modal-close"
              onClick={() => setBerichtModal(null)}
              aria-label="Schliessen"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <BerichtScreen
              berichtType={berichtModal}
              user={user}
              onBack={() => setBerichtModal(null)}
              onNavHome={() => setBerichtModal(null)}
              onNavRapport={() => setBerichtModal(null)}
              onNavProfile={() => setBerichtModal(null)}
              onLoggedOut={onLoggedOut}
            />
          </div>
        </div>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}
