import { useState, useEffect, useRef, useCallback } from 'react'
import { zeitAction, ZeitAction, submitCorrectionRequest, getCorrectionStatus, getZeitStatus, CorrectionPayload, ZeitStatus } from '../api/chat'
import { ApiError, isNetworkError, isOfflineError } from '../api/client'
import { drainActions, isQueueStuck, loadQueue, saveQueue } from '../api/zeitQueue'
import { breakInputValue, correctionError, correctionIncomplete, parseBreakMinutes } from '../api/correction'
import {
  autoBreakConfig, autoBreakRuleText, hasAutoBreak, noBreakPrefill,
  objectionExpired, OBJECTION_EXPIRED_HINT,
} from '../api/autoBreak'
import { UserInfo } from '../api/auth'
import { hasModule } from '../api/modules'
import { prefetchOfflinePackage } from '../api/offlineStore'
import { BerichtType } from './BerichtScreen'

interface Props {
  displayName: string
  logoUrl?: string
  role?: string
  user?: UserInfo | null
  onNavHome: () => void
  onNavRapport: () => void
  onNavProjekte: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
  onOpenBericht: (type: BerichtType) => void
  onNavAbsenzen: () => void
}

interface Action {
  label: string
  sub: string
  action: ZeitAction
  iconColor: string
  iconClass: string
  icon: React.ReactNode
}

const ACTIONS: Action[] = [
  {
    label: 'Einstempeln',
    sub: 'Arbeitsbeginn erfassen',
    action: 'clock_in',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    label: 'Ausstempeln',
    sub: 'Arbeitsende erfassen',
    action: 'clock_out',
    iconColor: '#22c55e',
    iconClass: 'menu-icon-green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
      </svg>
    ),
  },
  {
    label: 'Pause starten',
    sub: 'Beginn der Pause',
    action: 'start_break',
    iconColor: '#f59e0b',
    iconClass: 'menu-icon-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <line x1="6" y1="1" x2="6" y2="4"/>
        <line x1="10" y1="1" x2="10" y2="4"/>
        <line x1="14" y1="1" x2="14" y2="4"/>
      </svg>
    ),
  },
  {
    label: 'Pause beenden',
    sub: 'Ende der Pause',
    action: 'end_break',
    iconColor: '#f59e0b',
    iconClass: 'menu-icon-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <polyline points="10 13 12 15 16 11"/>
      </svg>
    ),
  },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function ArbeitsZeitScreen({ logoUrl, role, user = null, onNavHome, onNavRapport, onNavProjekte, onNavProfile, onLoggedOut, onOpenBericht, onNavAbsenzen }: Props) {
  // Gleiche Regel wie im HomeScreen: `user_light` ist reiner Zeiterfasser —
  // kein Chat, keine Projekte (docs/Admin_Handbuch.md §12). Der Tab stand hier
  // trotzdem, weil `role` zwar durchgereicht, aber nie benutzt wurde: der Monteur
  // tippte auf «Projekte» und landete kommentarlos wieder auf Home (der Guard in
  // App.tsx leitet um). Sichtbarer Weg, der nirgends hinführt — für den Benutzer
  // nicht von einem Fehler zu unterscheiden.
  const isLight = role === 'user_light'
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)
  const [reportLoading] = useState(false)
  const [queueSize, setQueueSize] = useState(() => loadQueue().length)
  const [draining, setDraining] = useState(false)
  const [queueStuck, setQueueStuck] = useState(() => isQueueStuck(loadQueue()))

  // Re-Entrancy-Schutz: flatterndes Netz (mehrere online-Events kurz
  // hintereinander) darf keine zwei Drains parallel starten — sonst wird
  // jeder Stempel doppelt gesendet.
  const drainingRef = useRef(false)

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return
    if (!navigator.onLine) return // chancenlos — würde nur attempts hochzählen
    const q = loadQueue()
    if (q.length === 0) return
    drainingRef.current = true
    setDraining(true)
    let outcome: Awaited<ReturnType<typeof drainActions>> | null = null
    try {
      outcome = await drainActions(q, item => zeitAction(item.action, { recorded_at: item.recorded_at }))
    } finally {
      // Während des Drains kann sendAction neue Stempel angehängt haben —
      // die dürfen beim Zurückschreiben nicht überschrieben werden.
      const merged = [...(outcome?.remaining ?? q), ...loadQueue().slice(q.length)]
      saveQueue(merged)
      setQueueSize(merged.length)
      setQueueStuck(isQueueStuck(merged))
      setDraining(false)
      drainingRef.current = false

      // Abgelehnte Stempel haben Vorrang in der Meldung: sie sind nicht gebucht
      // und ohne Korrekturantrag für immer weg.
      const rejected = outcome?.rejected ?? []
      if (rejected.length > 0) {
        setResult({
          text: `${rejected.length} Stempel konnte${rejected.length > 1 ? 'n' : ''} nicht übernommen werden: `
            + `${rejected[0].reply} Bitte stelle einen Korrekturantrag.`,
          isError: true,
        })
      } else if (merged.length === 0 && (outcome?.applied ?? 0) > 0) {
        setResult({ text: 'Offline-Aktionen wurden erfolgreich synchronisiert.', isError: false })
      }
    }
  }, [])

  useEffect(() => {
    // Drain-on-Mount: das online-Event feuert nur beim Offline→Online-Wechsel
    // bei offener App. Wer offline stempelt, die App schliesst und später
    // online wieder öffnet, bekäme es nie — die Stempel blieben liegen.
    if (navigator.onLine) { void drainQueue() }
    const onOnline = () => { void drainQueue() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drainQueue])

  // Korrektur-Formular
  const [showCorrection, setShowCorrection] = useState(false)
  const [corrForm, setCorrForm] = useState<CorrectionPayload>({
    date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '',
  })
  const [corrLoading, setCorrLoading] = useState(false)
  // Inhaltlicher Fehler im Antrag (Pause > Anwesenheit, Ausstempel vor
  // Einstempel). Muss vor dem Absenden greifen: das Backend würde daraus bei
  // der Genehmigung still 0 Arbeitsminuten machen.
  const corrError = correctionError(corrForm)
  const [pendingCorrection, setPendingCorrection] = useState<{ id: string; date: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Automatischer Pausenabzug ────────────────────────────────────────────
  // Der Widerlegungsweg existiert bereits (der Korrekturantrag) — er ist nur zu
  // umständlich. Hier wird er vorbefüllt: der Monteur bestätigt, statt seine
  // Zeiten aus dem Kopf abzutippen (docs/specs/automatische-pause.md §3.5).
  const autoBreak = autoBreakConfig(user)
  const [lastSession, setLastSession] = useState<ZeitStatus['last_session']>(null)

  useEffect(() => {
    if (!autoBreak) return
    let cancelled = false
    getZeitStatus()
      .then(st => { if (!cancelled) setLastSession(st.last_session ?? null) })
      .catch(() => { /* nur die Vorbefüllung — der Screen funktioniert auch ohne */ })
    return () => { cancelled = true }
  }, [autoBreak])

  const canObject = hasAutoBreak(lastSession) && !objectionExpired(lastSession!.date, autoBreak)
  const objectionTooLate = hasAutoBreak(lastSession) && !canObject

  function openNoBreakForm() {
    if (!lastSession) return
    setCorrForm(noBreakPrefill(lastSession))
    setShowCorrection(true)
    setResult(null)
  }

  useEffect(() => {
    if (!pendingCorrection) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    const check = async () => {
      try {
        const s = await getCorrectionStatus(pendingCorrection.id)
        if (s.status === 'approved') {
          setResult({ text: `Korrektur für ${pendingCorrection.date} wurde genehmigt und angewendet.`, isError: false })
          setPendingCorrection(null)
        } else if (s.status === 'rejected') {
          const note = s.review_note ? ` Grund: ${s.review_note}` : ''
          setResult({ text: `Korrektur für ${pendingCorrection.date} wurde abgelehnt.${note}`, isError: true })
          setPendingCorrection(null)
        }
      } catch {
        // Netzwerkfehler — einfach beim nächsten Intervall neu versuchen
      }
    }
    check()
    pollRef.current = setInterval(check, 15000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [pendingCorrection])

  async function handleCorrectionSubmit() {
    if (correctionIncomplete(corrForm) || correctionError(corrForm) !== null) return
    setCorrLoading(true)
    setResult(null)
    try {
      const res = await submitCorrectionRequest(corrForm)
      setResult({ text: res.reply, isError: !res.action_taken })
      if (res.correction_id) {
        setPendingCorrection({ id: res.correction_id, date: corrForm.date })
      }
      setShowCorrection(false)
      setCorrForm({ date: today(), clock_in: '', clock_out: '', break_minutes: 0, reason: '' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      let text = 'Fehler beim Einreichen. Bitte erneut versuchen.'
      if (isOfflineError(err)) text = 'Keine Internetverbindung'
      else if (err instanceof ApiError && err.status === 409 && err.message === 'absence_on_date') {
        text = 'Für diesen Tag ist bereits eine Absenz genehmigt — keine Zeitkorrektur möglich.'
      }
      // Die Frist schliesst den Self-Service, nicht den Anspruch — deshalb sagt
      // die Meldung, wohin man sich stattdessen wendet, statt nur "abgelehnt".
      else if (err instanceof ApiError && err.status === 409 && err.message === 'auto_break_objection_expired') {
        text = OBJECTION_EXPIRED_HINT
      }
      // 400 trägt vom Endpoint bereits deutschen Klartext (unplausible Zeiten) —
      // den zeigen statt ihn hinter der generischen Meldung zu verstecken.
      // Einzige Ausnahme: `no_staff_linked` ist ein Code, keine Meldung.
      else if (err instanceof ApiError && err.status === 400) {
        text = err.message === 'no_staff_linked'
          ? 'Dein Konto ist keinem Mitarbeiter zugeordnet. Bitte beim Vorgesetzten melden.'
          : err.message
      }
      setResult({ text, isError: true })
    } finally {
      setCorrLoading(false)
    }
  }

  function enqueue(action: ZeitAction, recorded_at: string, text: string) {
    const q = loadQueue()
    q.push({ action, recorded_at })
    saveQueue(q)
    setQueueSize(q.length)
    setResult({ text, isError: false })
  }

  async function sendAction(action: ZeitAction, idx: number) {
    setResult(null)
    setLoadingIdx(idx)
    const recorded_at = new Date().toISOString()

    // Liegen noch ältere Stempel in der Queue, muss dieser sich hinten anstellen.
    // Sonst überholt er sie: das Netz kommt zurück, der Monteur tippt sofort
    // "Ausstempeln", es geht live raus — auf eine Session, deren Einstempeln noch
    // in der Queue liegt. Der Server kennt sie nicht, der Stempel ist verloren.
    if (loadQueue().length > 0) {
      enqueue(action, recorded_at, 'Wird nach den älteren Stempeln gesendet.')
      setLoadingIdx(null)
      void drainQueue()
      return
    }

    try {
      const res = await zeitAction(action, { recorded_at })
      setResult({ text: res.reply, isError: !res.action_taken })
      // Einstempeln ist der verlässlichste Netz-Moment des Tages: morgens, meist
      // noch im WLAN des Werkhofs, bevor es in die Tiefgarage geht. Genau dann
      // das Offline-Lesepaket füllen (docs/specs/offline-modus.md §3.3) — mit
      // `force`, weil die 15-Minuten-Drosselung sonst ausgerechnet diesen Moment
      // verpassen kann. Läuft nebenher und wirft nie.
      // `user_light` bleibt aussen vor — reiner Zeiterfasser, sieht keine
      // Projekte, bekäme auf /pwa/projects einen erwarteten 403.
      if (action === 'clock_in' && res.action_taken && user && user.role !== 'user_light') {
        void prefetchOfflinePackage(user.authorized_user_id, {
          scheduling: hasModule(user, 'scheduling'),
          force: true,
        })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      // Bewusst isNetworkError statt isOfflineError: "verbunden, aber kein
      // Durchkommen" (Funkloch, Timeout) meldet navigator.onLine === true und
      // ist auf der Baustelle der Normalfall — ein verlorener Stempel wäre
      // verlorener Lohn. Den Dauerfehler-Fall (CORS/Origin, ebenfalls status 0)
      // fängt der MAX_DRAIN_ATTEMPTS-Deckel der Queue ab.
      if (isNetworkError(err)) {
        enqueue(action, recorded_at, 'Offline gespeichert – wird gesendet sobald Verbindung vorhanden.')
      } else {
        setResult({ text: 'Fehler beim Senden. Bitte erneut versuchen.', isError: true })
      }
    } finally {
      setLoadingIdx(null)
    }
  }


  return (
    <div className="app-screen">
      {/* Header */}
      <div className="inner-header">
        <div className="back-btn" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Arbeitszeit</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Banner */}
      <div className="context-banner context-banner-green">
        <div className="banner-tag banner-tag-green">HR Assistent</div>
        <div className="banner-text">Hier verwaltest du deine Arbeitszeiten, Pausen und Abwesenheiten.</div>
      </div>

      {/* Result */}
      {result && (
        <div className={`action-result${result.isError ? ' action-result-error' : ''}`}>
          {result.text}
        </div>
      )}

      {/* Offline queue banner */}
      {queueSize > 0 && !queueStuck && (
        <div className="action-result" style={{ background: '#1e3a5f', color: '#93c5fd', borderLeft: '3px solid #3b82f6' }}>
          {draining
            ? `${queueSize} Aktion${queueSize > 1 ? 'en' : ''} wird synchronisiert…`
            : `${queueSize} Aktion${queueSize > 1 ? 'en' : ''} offline gespeichert – wird gesendet sobald Verbindung vorhanden.`}
        </div>
      )}
      {queueStuck && (
        <div className="action-result action-result-error">
          {queueSize} Aktion{queueSize > 1 ? 'en' : ''} können nicht gesendet werden. Bitte App deinstallieren und neu installieren — danach beim Vorgesetzten melden, damit die fehlenden Stempel manuell nachgetragen werden.
        </div>
      )}

      {/* Pending correction banner */}
      {pendingCorrection && (
        <div className="action-result" style={{ background: 'var(--accent-amber-dim)', color: 'var(--accent-amber-ink)', borderLeft: '3px solid var(--accent-amber)' }}>
          Korrekturantrag für {pendingCorrection.date} eingereicht. Warte auf Genehmigung…
        </div>
      )}

      {/* Actions */}
      <div className="menu-list">
        {ACTIONS.map((action, idx) => (
          <div
            key={action.label}
            className="menu-item"
            onClick={() => loadingIdx === null && !reportLoading && sendAction(action.action, idx)}
            style={{ opacity: (loadingIdx !== null && loadingIdx !== idx) || reportLoading ? 0.5 : 1 }}
          >
            <div className={`menu-icon ${action.iconClass}`}>
              {action.icon}
            </div>
            <div className="menu-text">
              <div className="menu-label">
                {loadingIdx === idx ? '…' : action.label}
              </div>
              <div className="menu-sub">{action.sub}</div>
            </div>
            <div className="menu-chevron">›</div>
          </div>
        ))}

        {/* Arbeitszeitbericht — Monat */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onOpenBericht('monthly')}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="8 13 12 17 16 13"/>
              <line x1="12" y1="17" x2="12" y2="9"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Arbeitszeitbericht</div>
            <div className="menu-sub">Monatszeiten &amp; Überstunden anzeigen</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Wochenansicht — diese Woche */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onOpenBericht('weekly-this')}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Wochenansicht</div>
            <div className="menu-sub">Stundenjournal der aktuellen Woche</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Wochenansicht — letzte Woche */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onOpenBericht('weekly-last')}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <polyline points="8 14 10 16 8 18"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Letzte Woche</div>
            <div className="menu-sub">Stundenjournal der vergangenen Woche</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Absenzen */}
        <div
          className="menu-item"
          onClick={() => loadingIdx === null && onNavAbsenzen()}
          style={{ opacity: loadingIdx !== null ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Absenzen</div>
            <div className="menu-sub">Urlaub &amp; Abwesenheiten beantragen</div>
          </div>
          <div className="menu-chevron">›</div>
        </div>

        {/* Keine Pause gemacht — nur bei aktiver Regel und tatsächlichem Abzug.
            Zwei Taps: antippen, absenden. Die Zeiten kommen aus der Aufzeichnung. */}
        {hasAutoBreak(lastSession) && (
          <div
            className="menu-item"
            onClick={() => { if (canObject && loadingIdx === null) openNoBreakForm() }}
            style={{ opacity: canObject && loadingIdx === null ? 1 : 0.5 }}
          >
            <div className="menu-icon menu-icon-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="4" y1="2" x2="20" y2="22"/>
              </svg>
            </div>
            <div className="menu-text">
              <div className="menu-label">Keine Pause gemacht</div>
              <div className="menu-sub">
                {objectionTooLate
                  ? OBJECTION_EXPIRED_HINT
                  : `${lastSession!.auto_break_minutes} Min wurden am ${lastSession!.date} automatisch abgezogen`}
              </div>
            </div>
            {canObject && <div className="menu-chevron">›</div>}
          </div>
        )}

        {/* Arbeitszeit korrigieren */}
        <div
          className="menu-item"
          onClick={() => { setShowCorrection(v => !v); setResult(null) }}
          style={{ opacity: loadingIdx !== null || reportLoading ? 0.5 : 1 }}
        >
          <div className="menu-icon menu-icon-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div className="menu-text">
            <div className="menu-label">Arbeitszeit korrigieren</div>
            <div className="menu-sub">Korrekturantrag einreichen</div>
          </div>
          <div className="menu-chevron">{showCorrection ? '∨' : '›'}</div>
        </div>

        {/* Korrektur-Formular */}
        {showCorrection && (
          <div className="correction-form">
            {autoBreak && (
              <div className="corr-hint">{autoBreakRuleText(autoBreak)}</div>
            )}
            <div className="corr-row">
              <label className="corr-label">Datum</label>
              <input
                className="corr-input"
                type="date"
                value={corrForm.date}
                onChange={e => setCorrForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Einstempel</label>
              <input
                className="corr-input"
                type="time"
                value={corrForm.clock_in}
                onChange={e => setCorrForm(f => ({ ...f, clock_in: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Ausstempel</label>
              <input
                className="corr-input"
                type="time"
                value={corrForm.clock_out}
                onChange={e => setCorrForm(f => ({ ...f, clock_out: e.target.value }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Pause (Min)</label>
              <input
                className="corr-input"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={breakInputValue(corrForm.break_minutes)}
                onChange={e => setCorrForm(f => ({ ...f, break_minutes: parseBreakMinutes(e.target.value) }))}
              />
            </div>
            <div className="corr-row">
              <label className="corr-label">Grund</label>
              <input
                className="corr-input"
                type="text"
                placeholder="Vergessen einzustempeln, etc."
                value={corrForm.reason}
                onChange={e => setCorrForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {corrError && <div className="corr-error">{corrError}</div>}
            <div className="corr-actions">
              <button
                className="corr-btn corr-btn-cancel"
                onClick={() => setShowCorrection(false)}
                disabled={corrLoading}
              >
                Abbrechen
              </button>
              <button
                className="corr-btn corr-btn-submit"
                onClick={handleCorrectionSubmit}
                disabled={corrLoading || correctionIncomplete(corrForm) || corrError !== null}
              >
                {corrLoading ? '…' : 'Einreichen'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
        </div>
        {!isLight && (
          <div className="nav-item" onClick={onNavProjekte}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <path d="M9 22V12h6v10"/>
            </svg>
            <span>Projekte</span>
          </div>
        )}
        <div className="nav-item" onClick={onNavProfile}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profil</span>
        </div>
      </div>
    </div>
  )
}
