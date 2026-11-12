// Suchfeld im Kopf der Einsatzplanung (WW-69). Treffer kommen aus
// scheduleSearch.ts; ein Klick (oder Enter) springt im Kalender auf den Tag und
// öffnet den Termin im Panel — derselbe Weg wie ein Klick auf die Kachel.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fmtTimeRange, kindSymbol, type CalendarEntry } from './scheduleShared'
import { searchScheduleEntries, SEARCH_MIN_CHARS } from './scheduleSearch'
import { parseDateStr } from '../utils/calendarHelpers'

const MAX_HITS = 8

interface Props {
  entries: CalendarEntry[]
  todayIso: string
  onPick: (entry: CalendarEntry) => void
}

function fmtWhen(e: CalendarEntry): string {
  if (!e.start_date) return ''
  const day = parseDateStr(e.start_date).toLocaleDateString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const time = fmtTimeRange(e)
  return time ? `${day} · ${time}` : day
}

export default function ScheduleSearch({ entries, todayIso, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  // Timer des verzögerten Schliessens (onBlur). Muss beim Abbau der Komponente
  // weg: sonst setzt er State auf einer Komponente, die es nicht mehr gibt — in
  // den Tests nach dem Abbau von jsdom ein «window is not defined», das den
  // ganzen Vitest-Lauf rot macht, obwohl jeder Test grün ist.
  const closeTimer = useRef<number | null>(null)
  function cancelClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  useEffect(() => cancelClose, [])

  const hits = useMemo(() => searchScheduleEntries(entries, query, todayIso), [entries, query, todayIso])
  const shown = hits.slice(0, MAX_HITS)
  const showList = open && query.trim().length >= SEARCH_MIN_CHARS
  const current = Math.min(active, Math.max(0, shown.length - 1))

  function pick(entry: CalendarEntry) {
    onPick(entry)
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(Math.min(current + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(current - 1, 0)) }
    else if (e.key === 'Enter' && showList && shown[current]) { e.preventDefault(); pick(shown[current].entry) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="schedule-search">
      <input
        ref={inputRef}
        id="schedule-search-input"
        type="search"
        className="admin-input schedule-search-input"
        placeholder="Termin suchen …"
        aria-label="Termin suchen (Kunde, Projekt, Nummer, Adresse)"
        title="Kunde, Projektname, Projektnummer oder Adresse"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true) }}
        onFocus={() => { cancelClose(); setOpen(true) }}
        // Verzögert schliessen, sonst verschwindet die Liste, bevor der Klick ankommt.
        onBlur={() => {
          cancelClose()
          closeTimer.current = window.setTimeout(() => {
            closeTimer.current = null
            setOpen(false)
          }, 150)
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <div className="schedule-search-list" id={listId} role="listbox" aria-label="Gefundene Termine">
          {shown.length === 0 ? (
            <div className="schedule-search-empty">Kein Termin gefunden.</div>
          ) : shown.map((h, i) => (
            <button
              type="button"
              key={h.entry.id}
              role="option"
              aria-selected={i === current}
              className={`schedule-search-hit${i === current ? ' active' : ''}${h.upcoming ? '' : ' past'}`}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(h.entry)}
            >
              <span className="schedule-search-when">{fmtWhen(h.entry)}</span>
              <span className="schedule-search-title">
                <span aria-hidden="true">{kindSymbol(h.entry)} </span>{h.title}
                {h.entry.termin_badge && <span className="schedule-search-badge">{h.entry.termin_badge}</span>}
              </span>
              {h.detail && <span className="schedule-search-detail">{h.detail}</span>}
            </button>
          ))}
          {hits.length > MAX_HITS && (
            <div className="schedule-search-more">
              {hits.length - MAX_HITS} weitere Treffer — Suche genauer eingeben.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
