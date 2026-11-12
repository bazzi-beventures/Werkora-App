// Formatierer der Routen-Messung (RouteMetricsPanel). Eigene Datei, weil eine
// Komponenten-Datei nur Komponenten exportieren soll (react-refresh).

/** Bytes lesbar: B, KB, MB, GB (Basis 1024). */
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function formatMs(n: number | null | undefined): string {
  if (n == null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`
}

