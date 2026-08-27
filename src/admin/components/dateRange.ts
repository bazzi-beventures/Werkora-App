// Zeitraum-Auswahl der BI-Screens (LLM-Kosten, Nutzung).
//
// Lag bis 2026-08-22 lokal in LlmCostsScreen; hier herausgezogen, damit die
// Screens dieselben Presets, dieselbe Datumsformatierung und denselben
// PostgREST-Filter benutzen. Alles rechnet in LOKALER Zeit (kein UTC-Versatz):
// die Views gruppieren nach (created_at AT TIME ZONE 'Europe/Zurich')::date,
// ein UTC-Datum wäre am Monatsanfang und -ende um einen Tag daneben.

export type PresetId = '7t' | '30t' | '90t' | 'monat' | 'vormonat' | 'custom'

export interface DateRange {
  von: string
  bis: string
}

export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** ISO-Datum als de-CH-Anzeige: 2026-08-22 → 22.08.2026 */
export const fmtDE = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** x-Achsen-Tick: 2026-08-22 → 22.08 */
export const tickDM = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

export function presetRange(id: Exclude<PresetId, 'custom'>, today = new Date()): DateRange {
  switch (id) {
    case '7t':  return { von: isoLocal(addDays(today, -6)),  bis: isoLocal(today) }
    case '30t': return { von: isoLocal(addDays(today, -29)), bis: isoLocal(today) }
    case '90t': return { von: isoLocal(addDays(today, -89)), bis: isoLocal(today) }
    case 'monat':
      return { von: isoLocal(new Date(today.getFullYear(), today.getMonth(), 1)), bis: isoLocal(today) }
    case 'vormonat':
      return {
        von: isoLocal(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        // Tag 0 des laufenden Monats = letzter Tag des Vormonats
        bis: isoLocal(new Date(today.getFullYear(), today.getMonth(), 0)),
      }
  }
}

export const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: '7t',       label: '7 Tage' },
  { id: '30t',      label: '30 Tage' },
  { id: '90t',      label: '90 Tage' },
  { id: 'monat',    label: 'Dieser Monat' },
  { id: 'vormonat', label: 'Vormonat' },
]

/** Zeitraum als Beschriftung: ein Tag → '22.08.2026', sonst 'von – bis'. */
export const periodLabel = (von: string, bis: string) =>
  von === bis ? fmtDE(von) : `${fmtDE(von)} – ${fmtDE(bis)}`

/**
 * PostgREST-Filter auf die `datum`-Spalte der KPI-Views. Server-seitig, damit
 * nur der gewählte Zeitraum über die Leitung geht statt der ganzen Historie.
 */
export const dateFilter = (von: string, bis: string) => ({
  and: `(datum.gte.${von},datum.lte.${bis})`,
})
