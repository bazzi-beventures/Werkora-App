import { describe, it, expect } from 'vitest'
import {
  GANTT_BAR_H, GANTT_LANE_GAP, GANTT_MIN_BAR_PX, GANTT_ROW_PAD,
  barMetrics, computeGanttLanes, dayWidthPx, ganttDays, laneCount,
  plannedMinutes, rowHeightPx, timeOffsetX, utilizationPct, utilizationTone,
  xToDayIndex, xToSnappedTime,
} from './ganttGrid'

// Raster der Tests: 08:00–18:00 (10 h) bei 60 px/h → Tagesbreite 600 px.
const START = 8, END = 18, HW = 60
const DAY_W = 600

function ev(id: string, start: string | null, end: string | null = null) {
  return { id, start_time: start, end_time: end }
}

describe('ganttGrid — Achse', () => {
  it('ganttDays liefert aufeinanderfolgende Tage', () => {
    const days = ganttDays(new Date(2026, 7, 6), 3)
    expect(days.map(d => d.getDate())).toEqual([6, 7, 8])
  })

  it('dayWidthPx/timeOffsetX rechnen Uhrzeit in px', () => {
    expect(dayWidthPx(START, END, HW)).toBe(DAY_W)
    expect(timeOffsetX('08:00', START, HW)).toBe(0)
    expect(timeOffsetX('12:30', START, HW)).toBe(270)
    // Vor Rasteranfang → auf 0 begrenzt.
    expect(timeOffsetX('06:00', START, HW)).toBe(0)
  })
})

describe('ganttGrid — Balken', () => {
  it('positioniert Dauer als Breite auf dem richtigen Tag', () => {
    const { leftPx, widthPx } = barMetrics(ev('a', '09:00', '11:30'), 1, START, END, HW)
    expect(leftPx).toBe(DAY_W + 60)
    expect(widthPx).toBe(150)
  })

  it('ohne Endzeit gilt eine Stunde', () => {
    expect(barMetrics(ev('a', '09:00'), 0, START, END, HW).widthPx).toBe(60)
  })

  it('kurze Einsätze behalten eine greifbare Mindestbreite', () => {
    expect(barMetrics(ev('a', '09:00', '09:05'), 0, START, END, HW).widthPx).toBe(GANTT_MIN_BAR_PX)
  })

  it('schneidet am Tagesende ab statt in den Folgetag zu laufen', () => {
    const { leftPx, widthPx } = barMetrics(ev('a', '17:00', '23:00'), 0, START, END, HW)
    expect(leftPx).toBe(540)
    expect(leftPx + widthPx).toBe(DAY_W)
  })
})

describe('ganttGrid — Drop-Positionen', () => {
  it('xToDayIndex trifft die Tages-Spalte und bleibt im sichtbaren Bereich', () => {
    expect(xToDayIndex(10, 3, START, END, HW)).toBe(0)
    expect(xToDayIndex(DAY_W + 10, 3, START, END, HW)).toBe(1)
    expect(xToDayIndex(99999, 3, START, END, HW)).toBe(2)
    expect(xToDayIndex(-50, 3, START, END, HW)).toBe(0)
  })

  it('xToSnappedTime rundet auf 15 Minuten, tagesrelativ', () => {
    expect(xToSnappedTime(0, START, END, HW)).toBe('08:00')
    expect(xToSnappedTime(70, START, END, HW)).toBe('09:15')
    // Zweiter Tag, gleiche Uhrzeit wie 70 px am ersten.
    expect(xToSnappedTime(DAY_W + 70, START, END, HW)).toBe('09:15')
  })

  it('xToSnappedTime begrenzt auf das Raster', () => {
    expect(xToSnappedTime(-100, START, END, HW)).toBe('08:00')
  })
})

describe('ganttGrid — Lanes', () => {
  it('überlappende Einsätze kommen untereinander, getrennte in dieselbe Lane', () => {
    const lanes = computeGanttLanes([
      ev('a', '09:00', '11:00'),
      ev('b', '10:00', '12:00'),
      ev('c', '13:00', '14:00'),
    ])
    expect(lanes.get('a')).toBe(0)
    expect(lanes.get('b')).toBe(1)
    expect(lanes.get('c')).toBe(0)
    expect(laneCount(lanes)).toBe(2)
  })

  it('ganztägige Einsätze bekommen keine Lane', () => {
    const lanes = computeGanttLanes([ev('a', null), ev('b', '09:00', '10:00')])
    expect(lanes.has('a')).toBe(false)
    expect(laneCount(lanes)).toBe(1)
  })

  it('Zeilenhöhe wächst mit der Lane-Zahl', () => {
    expect(rowHeightPx(1)).toBe(GANTT_BAR_H + 2 * GANTT_ROW_PAD)
    expect(rowHeightPx(2)).toBe(2 * GANTT_BAR_H + GANTT_LANE_GAP + 2 * GANTT_ROW_PAD)
    // Leere Zeile bleibt eine Balkenhöhe hoch.
    expect(rowHeightPx(0)).toBe(rowHeightPx(1))
  })
})

describe('ganttGrid — Auslastung', () => {
  it('summiert Dauern; ohne Endzeit zählt eine Stunde', () => {
    expect(plannedMinutes([ev('a', '08:00', '12:00'), ev('b', '13:00')], 480)).toBe(300)
  })

  it('ganztägige Einsätze belegen den vollen Tag', () => {
    expect(plannedMinutes([ev('a', null)], 480)).toBe(480)
  })

  it('rechnet Prozent gegen die Kapazität; ohne Kapazität null', () => {
    expect(utilizationPct(240, 480)).toBe(50)
    expect(utilizationPct(600, 480)).toBe(125)
    expect(utilizationPct(240, 0)).toBeNull()
  })

  it('Ampel: leer/grün/gelb/orange/rot', () => {
    expect(utilizationTone(0)).toBe('idle')
    expect(utilizationTone(null)).toBe('idle')
    expect(utilizationTone(30)).toBe('low')
    expect(utilizationTone(50)).toBe('mid')
    expect(utilizationTone(85)).toBe('high')
    expect(utilizationTone(101)).toBe('over')
  })
})
