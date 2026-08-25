export function fmtCHF(amount: number): string {
  return `CHF ${amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Zeitstempel — geteilt mit der Monteur-PWA (Charge H5).
export { formatDateTime } from '../../shared/datetime'

/** Heutiges Datum als JJJJ-MM-TT für <input type="date"> — in LOKALER Zeit.
 *  Bewusst nicht `toISOString().slice(0, 10)`: das rechnet nach UTC um und liefert in
 *  der Schweiz zwischen Mitternacht und 01:00 (bzw. 02:00 im Sommer) noch das Datum
 *  von gestern. Bei einem Aufgabedatum wäre das ein stiller Tag Rückstand. */
export function todayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
