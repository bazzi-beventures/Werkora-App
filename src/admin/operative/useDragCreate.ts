// Neuen Termin im Zeitraster aufziehen — Verhalten wie in Google Kalender.
//
// Vorher (ScheduleWeekView, bis 2026-11) rundete der Zug Start UND Ende auf die
// nächste Viertelstunde der Mausposition: ab x:08 sprang der Start auf x:15, beim
// Ziehen nach oben fiel der gegriffene Slot weg, die Box lag nicht auf dem Raster,
// ein Klick zeigte «09:00–09:00», Scrollen während des Zugs verschob die Zeiten,
// und beim Loslassen verschwand die Auswahl. Jetzt:
//
// * Anker ist der 15-min-Slot UNTER dem Zeiger (abgerundet) — er gehört immer zur
//   Auswahl, nach unten wie nach oben gezogen.
// * Die Box rastet ein (Pixel aus den gerundeten Minuten, nicht aus der Maus).
// * Ein Klick (Zug < 4 px) ergibt einen Block von einer Stunde — und zeigt ihn
//   schon beim Drücken so an, wie er nachher angelegt wird.
// * Die Spaltenlage wird bei jeder Bewegung neu gemessen; nahe am Rand des
//   Scroll-Containers scrollt er selbst weiter.
// * Esc bricht ab; ein Unmount mitten im Zug räumt die Listener weg.
// * Nur Maus/Stift: auf Touch bleibt der Finger zum Scrollen da.
import { useEffect, useRef, useState } from 'react'
import { minToHHMM } from '../utils/calendarHelpers'
import { WEEK_SNAP_MIN } from '../utils/weekGrid'

export interface CreateGrid {
  startHour: number
  endHour: number
  hourHeight: number
}

export interface CreateSelection {
  startMin: number
  endMin: number
}

/** Dauer eines Klick-Termins (ohne Ziehen), Minuten. */
export const CLICK_DAUER_MIN = 60
/** Ab so viel Pixel Bewegung ist es ein Zug und kein Klick. */
export const CLICK_TOLERANZ_PX = 4
/** Randzone (px) im Scroll-Container, in der der Zug weiterscrollt. */
const AUTOSCROLL_ZONE_PX = 40
const AUTOSCROLL_SCHRITT_PX = 12

function pxToMin(px: number, g: CreateGrid): number {
  return g.startHour * 60 + (px / g.hourHeight) * 60
}

/** Rein: Auswahl aus Anker- und aktueller Position (px ab Rasteroberkante). */
export function selectionFromDrag(anchorPx: number, currentPx: number, g: CreateGrid, isClick: boolean): CreateSelection {
  const min = g.startHour * 60
  const max = g.endHour * 60
  const snapDown = (m: number) => Math.floor(m / WEEK_SNAP_MIN) * WEEK_SNAP_MIN
  const snapUp = (m: number) => Math.ceil(m / WEEK_SNAP_MIN) * WEEK_SNAP_MIN
  const clamp = (m: number) => Math.max(min, Math.min(max, m))
  // Anker-Slot: der Slot unter dem Zeiger; der letzte Slot des Rasters ist der späteste.
  const anchor = Math.min(max - WEEK_SNAP_MIN, Math.max(min, snapDown(pxToMin(anchorPx, g))))
  if (isClick) {
    // Am Rasterende kürzer statt über das Raster hinaus — mindestens ein Slot.
    return { startMin: anchor, endMin: Math.min(max, anchor + CLICK_DAUER_MIN) }
  }
  const cur = clamp(pxToMin(currentPx, g))
  if (cur >= anchor) {
    return { startMin: anchor, endMin: clamp(Math.max(anchor + WEEK_SNAP_MIN, snapUp(cur))) }
  }
  return { startMin: clamp(snapDown(cur)), endMin: anchor + WEEK_SNAP_MIN }
}

/** Box-Geometrie (px ab Rasteroberkante) einer Auswahl — eingerastet. */
export function selectionBox(s: CreateSelection, g: CreateGrid): { topPx: number; heightPx: number } {
  return {
    topPx: ((s.startMin - g.startHour * 60) / 60) * g.hourHeight,
    heightPx: ((s.endMin - s.startMin) / 60) * g.hourHeight,
  }
}

export function selectionLabel(s: CreateSelection): string {
  return `${minToHHMM(s.startMin)}–${minToHHMM(s.endMin)}`
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export interface DragCreateBox {
  dayISO: string
  topPx: number
  heightPx: number
  label: string
}

/**
 * Aufziehen in einer Tagesspalte. `onPointerDown` an die Spalte hängen; `box` ist
 * die laufende Auswahl (null, wenn keine). `onCreate` bekommt Tag und Zeiten.
 */
export function useDragCreate(grid: CreateGrid, onCreate?: (dayISO: string, startTime: string, endTime: string) => void) {
  const [box, setBox] = useState<DragCreateBox | null>(null)
  // Neueste Rasterwerte und Callback für die Fenster-Listener eines laufenden Zugs.
  const latest = useRef({ grid, onCreate })
  useEffect(() => { latest.current = { grid, onCreate } })
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])

  function onPointerDown(e: React.PointerEvent<HTMLElement>, dayISO: string) {
    if (!latest.current.onCreate || e.button !== 0 || e.pointerType === 'touch') return
    if ((e.target as HTMLElement).closest('.project-cal-week-event')) return
    e.preventDefault()
    stopRef.current?.()
    const col = e.currentTarget
    const scroller = scrollParent(col)
    const anchorPx = e.clientY - col.getBoundingClientRect().top
    const startY = e.clientY
    let lastY = e.clientY
    let moved = false
    let raf = 0

    const current = (): CreateSelection => {
      const y = lastY - col.getBoundingClientRect().top
      return selectionFromDrag(anchorPx, y, latest.current.grid, !moved)
    }
    const show = () => {
      const s = current()
      setBox({ dayISO, ...selectionBox(s, latest.current.grid), label: selectionLabel(s) })
    }
    // Nahe am Rand des Scroll-Containers weiterscrollen, solange der Zug läuft.
    const tick = () => {
      if (scroller && moved) {
        const r = scroller.getBoundingClientRect()
        const dy = lastY < r.top + AUTOSCROLL_ZONE_PX ? -AUTOSCROLL_SCHRITT_PX
          : lastY > r.bottom - AUTOSCROLL_ZONE_PX ? AUTOSCROLL_SCHRITT_PX : 0
        if (dy) {
          scroller.scrollTop += dy
          show()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
      stopRef.current = null
      setBox(null)
    }
    const onMove = (ev: PointerEvent) => {
      lastY = ev.clientY
      if (!moved && Math.abs(lastY - startY) >= CLICK_TOLERANZ_PX) moved = true
      show()
    }
    const onUp = () => {
      const s = current()
      stop()
      latest.current.onCreate?.(dayISO, minToHHMM(s.startMin), minToHHMM(s.endMin))
    }
    const onCancel = () => stop()
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') stop() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    stopRef.current = stop
    raf = requestAnimationFrame(tick)
    show()
  }

  // preventDefault am pointerdown hält nicht in jedem Browser die Textauswahl
  // des nachfolgenden mousedown auf — darum auch dort, nur auf freier Fläche.
  function onMouseDown(e: React.MouseEvent<HTMLElement>) {
    if (!latest.current.onCreate || e.button !== 0) return
    if ((e.target as HTMLElement).closest('.project-cal-week-event')) return
    e.preventDefault()
  }

  return { box, onPointerDown, onMouseDown }
}
