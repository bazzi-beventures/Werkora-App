import { useEffect, useState } from 'react'

export interface ChartTheme {
  grid: string
  axis: string
  tickMuted: string
  tickStrong: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

function read(): ChartTheme {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) =>
    (cs.getPropertyValue(name).trim() || fallback)
  return {
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
