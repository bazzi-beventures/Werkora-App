// Mini-Monatskalender zum Anspringen eines Tages — die kleine Monatsübersicht,
// die man aus Google Calendar kennt.
//
// Warum: Tagesplan und Plantafel navigieren in 1–7-Tage-Schritten. Wer vom
// 14.08. zum 03.09. will, klickt sonst zwanzigmal auf «→». Der Picker hängt am
// Titel der Toolbar und schiebt `currentDate` in einem Klick an die richtige
// Stelle — unabhängig davon, welche Ansicht gerade aktiv ist.
//
// Bewusst KEINE eigene Kalender-Ansicht: er zeigt nur, an welchen Tagen etwas
// steht (Punkt unter der Zahl), nicht was. Das bleibt Sache der Ansichten.

import { useEffect, useRef, useState } from 'react'
import { getMonthDays, isToday, toDateStr } from '../utils/calendarHelpers'

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

interface Props {
  // Beschriftung des Auslösers = Titel der aktuellen Ansicht (Woche/Monat/Tag).
  label: string
  // Aktuell angezeigtes Datum; bestimmt Vorauswahl und den beim Öffnen gezeigten Monat.
  value: Date
  onPick: (d: Date) => void
  // ISO-Tage mit mindestens einem Einsatz — Punkt unter der Tageszahl.
  eventDays?: Set<string>
  holidays?: Map<string, string>
}

export default function MiniMonthPicker({ label, value, onPick, eventDays, holidays }: Props) {
  const [open, setOpen] = useState(false)
  // Im Popover geblätterter Monat — unabhängig von `value`, damit man erst
  // suchen und dann wählen kann.
  const [viewMonth, setViewMonth] = useState(value)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Beim Öffnen immer am aktuell angezeigten Datum starten, nicht dort, wo man
  // beim letzten Mal aufgehört hat zu blättern.
  function toggle() {
    if (!open) setViewMonth(value)
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(d: Date) {
    onPick(d)
    setOpen(false)
  }

  function stepMonth(delta: number) {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  const selectedISO = toDateStr(value)
  const days = getMonthDays(viewMonth)

  return (
    <div className="project-cal-datepicker" ref={wrapRef}>
      <button
        type="button"
        className="project-cal-datepicker-trigger"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Monatsübersicht öffnen und Tag wählen"
      >
        {label}
        <span className="project-cal-datepicker-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="project-cal-datepicker-pop" role="dialog" aria-label="Datum wählen">
          <div className="project-cal-datepicker-head">
            <button
              type="button"
              className="project-cal-datepicker-nav"
              onClick={() => stepMonth(-1)}
              aria-label="Vorheriger Monat"
            >‹</button>
            <span className="project-cal-datepicker-month">
              {viewMonth.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="project-cal-datepicker-nav"
              onClick={() => stepMonth(1)}
              aria-label="Nächster Monat"
            >›</button>
          </div>

          <div className="project-cal-datepicker-grid">
            {DOW.map(d => (
              <div key={d} className="project-cal-datepicker-dow">{d}</div>
            ))}
            {days.map((day, i) => {
              if (!day) return <div key={i} className="project-cal-datepicker-blank" />
              const iso = toDateStr(day)
              const holiday = holidays?.get(iso)
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    'project-cal-datepicker-day' +
                    (iso === selectedISO ? ' selected' : '') +
                    (isToday(day) ? ' today' : '') +
                    (holiday ? ' holiday' : '')
                  }
                  onClick={() => pick(day)}
                  title={holiday || undefined}
                  aria-current={iso === selectedISO ? 'date' : undefined}
                >
                  {day.getDate()}
                  {eventDays?.has(iso) && (
                    <span className="project-cal-datepicker-dot" aria-hidden="true" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="project-cal-datepicker-foot">
            <button
              type="button"
              className="project-schedule-mini-btn"
              onClick={() => pick(new Date())}
            >Heute</button>
          </div>
        </div>
      )}
    </div>
  )
}
