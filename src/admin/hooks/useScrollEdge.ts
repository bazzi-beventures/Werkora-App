import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Setzt auf einem horizontal scrollenden Container die Klasse `is-scroll-end`,
 * sobald rechts nichts mehr folgt.
 *
 * Damit kann CSS eine Ausblendkante ("hier geht es weiter") zeigen und am Ende
 * wieder abschalten — sonst sieht auch die letzte Spalte/der letzte Tab
 * abgeschnitten aus, obwohl alles da ist.
 */
export function useScrollEdge<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function syncEdge() {
      const node = ref.current
      if (!node) return
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1
      node.classList.toggle('is-scroll-end', atEnd)
    }

    el.addEventListener('scroll', syncEdge, { passive: true })
    // Inhalt/Breite aendert sich (Filterwechsel, Rotation) → neu bewerten.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncEdge) : null
    ro?.observe(el)
    syncEdge()

    return () => {
      el.removeEventListener('scroll', syncEdge)
      ro?.disconnect()
    }
  }, [])

  return ref
}
