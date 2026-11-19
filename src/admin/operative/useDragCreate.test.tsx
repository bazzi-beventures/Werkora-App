import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { selectionFromDrag, selectionBox, selectionLabel, CLICK_DAUER_MIN, type CreateGrid } from './useDragCreate'
import { WeekView } from './ScheduleWeekView'
import { getWeekDays, toDateStr } from '../utils/calendarHelpers'

// Termin aufziehen wie in Google Kalender (useDragCreate.ts).
// Raster 7–18 Uhr, 60 px je Stunde → 1 px = 1 Minute, 15 px = ein Slot.
const G: CreateGrid = { startHour: 7, endHour: 18, hourHeight: 60 }
const px = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h - 7) * 60 + m
}
const lbl = (a: string, b: string, click = false) =>
  selectionLabel(selectionFromDrag(px(a), px(b), G, click))

describe('selectionFromDrag', () => {
  it('Anker ist der Slot unter dem Zeiger, nicht die gerundete Mausposition', () => {
    // Bisher sprang ein Druck auf 9:08 auf 9:15.
    expect(lbl('09:08', '10:20')).toBe('09:00–10:30')
  })

  it('nach oben gezogen bleibt der gegriffene Slot drin', () => {
    // Bisher: 9:07 → 8:00 ergab 08:00–09:00, der gegriffene Slot fehlte.
    expect(lbl('09:07', '08:00')).toBe('08:00–09:15')
    expect(lbl('11:20', '11:01')).toBe('11:00–11:30')
  })

  it('ein winziger Zug ist mindestens ein Slot', () => {
    expect(lbl('09:08', '09:10')).toBe('09:00–09:15')
  })

  it('Klick ergibt eine Stunde ab dem Slot — am Rasterende kürzer, nie null', () => {
    expect(lbl('09:08', '09:08', true)).toBe('09:00–10:00')
    expect(CLICK_DAUER_MIN).toBe(60)
    expect(lbl('17:50', '17:50', true)).toBe('17:45–18:00')
  })

  it('bleibt im Raster', () => {
    expect(lbl('10:00', '23:00')).toBe('10:00–18:00')
    expect(lbl('10:00', '03:00')).toBe('07:00–10:15')
  })

  it('die Box rastet ein', () => {
    const s = selectionFromDrag(px('09:08'), px('10:20'), G, false)
    expect(selectionBox(s, G)).toEqual({ topPx: 120, heightPx: 90 })
  })
})

describe('WeekView — Aufziehen', () => {
  const MON = toDateStr(getWeekDays(new Date())[0])

  function renderWeek(onCreateSlot = vi.fn(), pendingSlot: { dayISO: string; startTime: string; endTime: string } | null = null) {
    const utils = render(
      <WeekView
        projects={[]} staff={[]} currentDate={new Date()} onSelect={vi.fn()} onReschedule={vi.fn()}
        onCreateSlot={onCreateSlot} holidays={new Map()} hourHeight={60} absenceStaff={[]}
        pendingSlot={pendingSlot}
      />,
    )
    const col = utils.container.querySelector('.project-cal-week-day-col') as HTMLElement
    return { ...utils, col, onCreateSlot }
  }

  it('Klick legt eine Stunde an und zeigt sie schon beim Drücken', () => {
    const { col, onCreateSlot } = renderWeek()
    // jsdom misst 0: clientY ist damit direkt die Rasterposition (Raster ab 7 Uhr).
    fireEvent.pointerDown(col, { button: 0, clientY: px('09:08'), pointerType: 'mouse' })
    expect(screen.getByTestId('create-box').textContent).toBe('09:00–10:00')
    fireEvent.pointerUp(window, { clientY: px('09:08') })
    expect(onCreateSlot).toHaveBeenCalledWith(MON, '09:00', '10:00')
  })

  it('Ziehen nach oben, Escape bricht ab', () => {
    const { col, onCreateSlot } = renderWeek()
    fireEvent.pointerDown(col, { button: 0, clientY: px('10:05'), pointerType: 'mouse' })
    fireEvent.pointerMove(window, { clientY: px('08:40') })
    expect(screen.getByTestId('create-box').textContent).toBe('08:30–10:15')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('create-box')).toBeNull()
    fireEvent.pointerUp(window, { clientY: px('08:40') })
    expect(onCreateSlot).not.toHaveBeenCalled()
  })

  it('Touch zieht nichts auf (der Finger scrollt)', () => {
    const { col, onCreateSlot } = renderWeek()
    fireEvent.pointerDown(col, { button: 0, clientY: 100, pointerType: 'touch' })
    fireEvent.pointerUp(window, { clientY: 100 })
    expect(onCreateSlot).not.toHaveBeenCalled()
  })

  it('die Auswahl bleibt stehen, solange das Panel den Termin anlegt', () => {
    renderWeek(vi.fn(), { dayISO: MON, startTime: '09:00', endTime: '10:30' })
    expect(screen.getByTestId('create-box').textContent).toBe('09:00–10:30')
  })
})
