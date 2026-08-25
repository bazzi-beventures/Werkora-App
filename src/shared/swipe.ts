import { useRef } from 'react'

// Wischgesten auf dem Handy — bislang gab es in der PWA keine; die Tagesansicht
// des Wochenplans ist die erste Stelle, an der Wischen die natürliche Bedienung
// ist (ein Tag pro Bildschirm, die Woche liegt links und rechts daneben).

export type SwipeDirection = 'left' | 'right' | null

/** Mindeststrecke in px, ab der eine Berührung als Wischen zählt. Kürzer ist auf
 *  einer Kachel eher ein Tippen mit unruhigem Daumen. */
export const SWIPE_MIN_PX = 48

/** Waagrecht muss deutlich (Faktor 1.5) länger sein als senkrecht — sonst würde
 *  jedes schräge Scrollen durch eine lange Einsatzliste den Tag umblättern. */
export const SWIPE_AXIS_RATIO = 1.5

/** Reine Auswertung einer Wischstrecke. 'left' = nach links gewischt (dx < 0),
 *  fachlich «vorwärts». null = kein Wischen (zu kurz oder zu senkrecht). */
export function swipeDirection(dx: number, dy: number, minPx: number = SWIPE_MIN_PX): SwipeDirection {
  const ax = Math.abs(dx)
  if (ax < minPx) return null
  if (ax < Math.abs(dy) * SWIPE_AXIS_RATIO) return null
  return dx < 0 ? 'left' : 'right'
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/** Touch-Handler für einen wischbaren Bereich. Bewusst ohne preventDefault: der
 *  Bereich soll senkrecht weiter normal scrollen, die Geste wird erst beim
 *  Loslassen ausgewertet. */
export function useSwipe(onLeft: () => void, onRight: () => void): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      start.current = t ? { x: t.clientX, y: t.clientY } : null
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const from = start.current
      start.current = null
      const t = e.changedTouches[0]
      if (!from || !t) return
      const dir = swipeDirection(t.clientX - from.x, t.clientY - from.y)
      if (dir === 'left') onLeft()
      else if (dir === 'right') onRight()
    },
  }
}
