import { useState, useEffect } from 'react'
import { fetchMonthlyData, fetchWeeklyData, fetchVacationEntitlement, submitCorrectionRequest, MonthlyReportData, WeeklyReportData, ReportData, VacationEntitlement } from '../api/chat'
import { ApiError, apiBlobFetch, isOfflineError } from '../api/client'
import { autoBreakConfig, objectionExpired, OBJECTION_EXPIRED_HINT } from '../api/autoBreak'
import { UserInfo } from '../api/auth'

export type BerichtType = 'monthly' | 'weekly-this' | 'weekly-last'

interface Props {
  berichtType: BerichtType
  logoUrl?: string
  // Optional: die Admin-Ansicht (MyTimeScreen) bindet denselben Bericht ohne
  // Nutzerkontext ein — dann entfällt nur die Kennzeichnung der Regel-Pause.
  user?: UserInfo | null
  onBack: () => void
  onNavHome: () => void
  onNavRapport: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

function fmt_hours(h: number): string {
  const sign = h < 0 ? '-' : ''
  const abs = Math.abs(h)
  const hh = Math.floor(abs)
  const mm = Math.round((abs - hh) * 60)
  return `${sign}${hh}:${mm.toString().padStart(2, '0')}`
}

export default function BerichtScreen({ berichtType, logoUrl, user = null, onBack, onNavHome, onNavRapport, onNavProfile, onLoggedOut }: Props) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfMsg, setPdfMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [vacation, setVacation] = useState<VacationEntitlement | null>(null)

  // ── «Keine Pause gemacht» je Bericht-Zeile ────────────────────────────────
  // Hier sieht der Monteur seine älteren Tage — und damit die Abzüge, die beim
  // Ausstempeln nur einmal kurz aufgeblitzt sind. Der Antrag geht aus der
  // aufgezeichneten Zeile direkt raus, ohne Formular: Datum und Zeiten stehen
  // schon da, die Pause wird auf 0 gesetzt (docs/specs/automatische-pause.md §3.5).
  const autoBreak = autoBreakConfig(user)
  const [objecting, setObjecting] = useState<string | null>(null)
  const [objectionMsg, setObjectionMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [objected, setObjected] = useState<Set<string>>(new Set())

  async function objectNoBreak(dateIso: string, clockIn: string, clockOut: string) {
    if (!dateIso || objecting) return
    setObjecting(dateIso)
    setObjectionMsg(null)
    try {
      const res = await submitCorrectionRequest({
        date: dateIso,
        clock_in: clockIn,
        clock_out: clockOut,
        break_minutes: 0,
        reason: 'Keine Pause gemacht',
      })
      setObjected(prev => new Set(prev).add(dateIso))
      setObjectionMsg({ text: res.reply, isError: !res.action_taken })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      let text = 'Fehler beim Einreichen. Bitte erneut versuchen.'
      if (isOfflineError(err)) text = 'Keine Internetverbindung'
      else if (err instanceof ApiError && err.status === 409 && err.message === 'auto_break_objection_expired') {
        text = OBJECTION_EXPIRED_HINT
      } else if (err instanceof ApiError && err.status === 409 && err.message === 'absence_on_date') {
        text = 'Für diesen Tag ist bereits eine Absenz genehmigt.'
      } else if (err instanceof ApiError && err.status === 400) {
        text = err.message
      }
      setObjectionMsg({ text, isError: true })
    } finally {
      setObjecting(null)
    }
  }

  /** Die Zelle «Pause» inkl. Kennzeichnung und Widerspruchs-Knopf. */
  function breakCell(minutes: number, autoMinutes: number, dateIso: string, clockIn: string, clockOut: string) {
    const hasAuto = autoMinutes > 0
    const tooLate = hasAuto && objectionExpired(dateIso, autoBreak)
    const usable = hasAuto && !tooLate && !objected.has(dateIso) && clockIn !== '—' && clockOut !== '—'
    return (
      <td className="bericht-muted">
        {minutes > 0 ? `${minutes}'` : '—'}
        {hasAuto && (
          <>
            <span className="bericht-auto-break"> davon {autoMinutes}' autom.</span>
            {objected.has(dateIso) ? (
              <span className="bericht-auto-break">Antrag eingereicht</span>
            ) : tooLate ? (
              <span className="bericht-auto-break" title={OBJECTION_EXPIRED_HINT}>Frist abgelaufen</span>
            ) : usable ? (
              <button
                className="bericht-objection-btn"
                disabled={objecting !== null}
                onClick={() => void objectNoBreak(dateIso, clockIn, clockOut)}
              >
                {objecting === dateIso ? '…' : 'Keine Pause gemacht'}
              </button>
            ) : null}
          </>
        )}
      </td>
    )
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (berichtType === 'monthly') {
          setData(await fetchMonthlyData())
        } else {
          const period = berichtType === 'weekly-this' ? 'this_week' : 'last_week'
          setData(await fetchWeeklyData(period))
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
        if (err instanceof ApiError && err.status === 404) {
          setError('Keine Daten für diesen Zeitraum gefunden.')
        } else if (isOfflineError(err)) {
          setError('Keine Internetverbindung')
        } else {
          setError('Fehler beim Laden. Bitte erneut versuchen.')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [berichtType])

  useEffect(() => {
    let cancelled = false
    fetchVacationEntitlement()
      .then(v => { if (!cancelled) setVacation(v) })
      .catch(() => { /* Fehler hier blockieren den Bericht nicht */ })
    return () => { cancelled = true }
  }, [])

  async function handlePdfExport() {
    setPdfLoading(true)
    setPdfMsg(null)
    try {
      const url = berichtType === 'monthly'
        ? '/pwa/report/monthly-pdf'
        : berichtType === 'weekly-this'
          ? '/pwa/report/weekly-pdf?period=this_week'
          : '/pwa/report/weekly-pdf?period=last_week'
      const { blob, filename } = await apiBlobFetch(url)
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(blobUrl)
      setPdfMsg({ text: 'PDF wird heruntergeladen…', isError: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setPdfMsg({ text: isOfflineError(err) ? 'Keine Internetverbindung' : 'PDF konnte nicht erstellt werden.', isError: true })
    } finally {
      setPdfLoading(false)
    }
  }

  function renderTitle(): string {
    if (!data) {
      if (berichtType === 'monthly') return 'Arbeitszeitbericht'
      return berichtType === 'weekly-this' ? 'Diese Woche' : 'Letzte Woche'
    }
    if (data.type === 'monthly') return `${data.monat_name} ${data.jahr}`
    return data.period_label
  }

  function renderSubtitle(): string {
    if (!data) return ''
    if (data.type === 'monthly') return `${data.arbeitstage} Arbeitstage · ${data.staff_name}`
    return `${data.period_start} – ${data.period_end} · ${data.staff_name}`
  }

  function renderMonthly(d: MonthlyReportData) {
    return (
      <>
        <div className="bericht-table-wrap">
          <table className="bericht-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Ein</th>
                <th>Aus</th>
                <th>Pause</th>
                <th>Std.</th>
              </tr>
            </thead>
            <tbody>
              {d.tage.map((t, i) => (
                <tr key={i}>
                  <td><span className="bericht-weekday">{t.wochentag}</span> {t.datum.slice(0, 5)}</td>
                  <td className="bericht-mono">{t.clock_in}</td>
                  <td className="bericht-mono">{t.clock_out}</td>
                  {breakCell(t.pause_min, t.auto_pause_min ?? 0, t.datum_iso, t.clock_in, t.clock_out)}
                  <td className="bericht-mono bericht-bold">{t.stunden_str}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bericht-summary">
          <div className="bericht-summary-row">
            <span className="bericht-summary-label">Total</span>
            <span className="bericht-summary-value bericht-mono">{d.total_stunden_str} Std.</span>
          </div>
          <div className="bericht-summary-row">
            <span className="bericht-summary-label">Soll</span>
            <span className="bericht-summary-value bericht-mono bericht-muted">{d.soll_stunden_str} Std.</span>
          </div>
          <div className="bericht-summary-row">
            <span className="bericht-summary-label">Überstunden</span>
            <span className={`bericht-summary-value bericht-mono ${d.ueberstunden_min >= 0 ? 'bericht-positive' : 'bericht-negative'}`}>
              {d.ueberstunden_str} Std.
            </span>
          </div>
          {vacation && (
            <div className="bericht-summary-row">
              <span className="bericht-summary-label">Ferien übrig</span>
              <span className="bericht-summary-value bericht-mono">
                {vacation.remaining} / {vacation.entitlement} Tage
              </span>
            </div>
          )}
        </div>
      </>
    )
  }

  function renderWeekly(d: WeeklyReportData) {
    const saldoPos = d.saldo >= 0
    return (
      <>
        <div className="bericht-table-wrap">
          <table className="bericht-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Ein</th>
                <th>Aus</th>
                <th>Pause</th>
                <th>Std.</th>
                <th>Projekt</th>
              </tr>
            </thead>
            <tbody>
              {d.days.map((day, i) => (
                <tr key={i} className={day.absence && day.net_hours === 0 ? 'bericht-row-absence' : ''}>
                  <td><span className="bericht-weekday">{day.weekday}</span> {day.date.slice(0, 5)}</td>
                  <td className="bericht-mono">{day.clock_in}</td>
                  <td className="bericht-mono">{day.clock_out}</td>
                  {breakCell(day.break_min, day.auto_break_min ?? 0, day.date_iso, day.clock_in, day.clock_out)}
                  <td className="bericht-mono bericht-bold">{fmt_hours(day.net_hours)}</td>
                  <td className="bericht-proj">{day.net_hours > 0 ? (day.projects || day.absence) : (day.absence || day.projects)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bericht-summary">
          <div className="bericht-summary-row">
            <span className="bericht-summary-label">Total</span>
            <span className="bericht-summary-value bericht-mono">{fmt_hours(d.total_net_hours)} Std.</span>
          </div>
          <div className="bericht-summary-row">
            <span className="bericht-summary-label">Soll</span>
            <span className="bericht-summary-value bericht-mono bericht-muted">{d.soll_hours} Std.</span>
          </div>
          <div className="bericht-summary-row">
            <span className="bericht-summary-label">Saldo</span>
            <span className={`bericht-summary-value bericht-mono ${saldoPos ? 'bericht-positive' : 'bericht-negative'}`}>
              {saldoPos ? '+' : ''}{fmt_hours(d.saldo)} Std.
            </span>
          </div>
          {vacation && (
            <div className="bericht-summary-row">
              <span className="bericht-summary-label">Ferien übrig</span>
              <span className="bericht-summary-value bericht-mono">
                {vacation.remaining} / {vacation.entitlement} Tage
              </span>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="app-screen">
      {/* Header */}
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">
          {berichtType === 'monthly' ? 'Arbeitszeitbericht' : 'Stundenjournal'}
        </div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Subtitle banner */}
      {data && (
        <div className="context-banner context-banner-blue">
          <div className="banner-tag banner-tag-blue">
            {data.type === 'monthly' ? 'Monatsbericht' : 'Wochenjournal'}
          </div>
          <div className="banner-text">{renderSubtitle()}</div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="bericht-scroll">
        {loading && (
          <div className="bericht-loading">Daten werden geladen…</div>
        )}
        {error && (
          <div className="action-result action-result-error" style={{ margin: '16px 24px' }}>{error}</div>
        )}
        {objectionMsg && (
          <div
            className={`action-result${objectionMsg.isError ? ' action-result-error' : ''}`}
            style={{ margin: '16px 24px' }}
          >
            {objectionMsg.text}
          </div>
        )}
        {!loading && !error && data && (
          data.type === 'monthly' ? renderMonthly(data) : renderWeekly(data as WeeklyReportData)
        )}
      </div>

      {/* PDF Export Button */}
      {!loading && !error && data && (
        <div className="bericht-export-bar">
          {pdfMsg && (
            <div className={`bericht-pdf-msg${pdfMsg.isError ? ' bericht-pdf-msg-error' : ''}`}>
              {pdfMsg.text}
            </div>
          )}
          <button
            className="bericht-export-btn"
            onClick={handlePdfExport}
            disabled={pdfLoading}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="8 13 12 17 16 13"/>
              <line x1="12" y1="17" x2="12" y2="9"/>
            </svg>
            {pdfLoading ? 'PDF wird erstellt…' : 'Als PDF exportieren'}
          </button>
        </div>
      )}

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className="nav-item" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
        </div>
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
