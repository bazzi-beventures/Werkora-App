import { useEffect, useState } from 'react'

export interface ChartTheme {
  /** Serienfarben in fester Reihenfolge (--chart-1..8 aus index.css).
   *  Recharts nimmt in `fill`/`stroke` keine CSS-Variablen an — deshalb werden
   *  sie hier zu konkreten Werten aufgeloest und beim Theme-Wechsel neu
   *  gelesen, wie der Rest dieses Hooks. */
  series: string[]
  grid: string
  axis: string
  tickMuted: string
  tickStrong: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

// Nur der Rueckfall, falls die Variablen nicht gelesen werden koennen (Tests
// ohne CSS, sehr frueher Render). Die Wahrheit steht in index.css.
const SERIES_FALLBACK = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
]

function read(): ChartTheme {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) =>
    (cs.getPropertyValue(name).trim() || fallback)
  return {
    series: SERIES_FALLBACK.map((fb, i) => v(`--chart-${i + 1}`, fb)),
    grid: v('--border-subtle', 'rgba(148,163,184,0.12)'),
    axis: v('--border', '#334155'),
    tickMuted: v('--text-muted', '#94A3B8'),
    tickStrong: v('--text', '#F1F5F9'),
    tooltipBg: v('--surface', '#1E293B'),
    tooltipBorder: v('--border', '#334155'),
    tooltipText: v('--text', '#F1F5F9'),
  }
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => read())

  useEffect(() => {
    const update = () => setTheme(read())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
