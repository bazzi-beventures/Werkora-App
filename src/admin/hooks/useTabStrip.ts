import { useEffect } from 'react'
import { useScrollEdge } from './useScrollEdge'

/**
 * Tab-Leiste (.kpi-admin-tabs), die auf schmalen Screens horizontal scrollt.
 *
 * Zusaetzlich zur Ausblendkante (useScrollEdge) wird der aktive Tab sichtbar
 * gescrollt. Ohne das steht man nach einem Wechsel per Deep-Link oder Tastatur
 * vor einer Leiste, in der der aktive Tab ausserhalb des Viewports liegt.
 *
 * `activeKey` in die Deps geben, damit beim Tabwechsel neu gescrollt wird.
 */
export function useTabStrip(activeKey: string) {
  const ref = useScrollEdge<HTMLDivElement>()

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('.kpi-admin-tab.active')
    // scrollIntoView gibt es in jsdom nicht — Tests sollen daran nicht scheitern.
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [ref, activeKey])

  return ref
}
