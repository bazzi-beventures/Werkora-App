export function fmtCHF(amount: number): string {
  return `CHF ${amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Ganze Tage seit `iso` (0 ohne Datum). */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
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

/** Untergrenze eines plausiblen Termin-Datums. Pendant zu
 *  db/project_appointments.py::DATUM_MIN — ein Jahr «0206» entsteht, wenn im
 *  Jahr-Segment eines Datumsfelds «206» statt «2026» steht, und der Termin fehlte
 *  danach in jedem Plan (docs/specs/kachel-projekte-ueberfaellig.md §2.1). */
export const DATUM_MIN = '2000-01-01'

/** Obergrenze eines plausiblen Termin-Datums: heute + 10 Jahre, in lokaler Zeit
 *  (Pendant zu DATUM_MAX_JAHRE im Server). Der 29. Februar fällt auf den 28. */
export function datumMax(now: Date = new Date()): string {
  const jahr = now.getFullYear() + 10
  const monat = now.getMonth()
  const letzterTag = new Date(jahr, monat + 1, 0).getDate()
  return todayISO(new Date(jahr, monat, Math.min(now.getDate(), letzterTag)))
}

/** `YYYY-MM-DD` innerhalb von DATUM_MIN … datumMax(). Leer zählt als plausibel. */
export function istPlausiblesDatum(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return true
  const tag = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return false
  return tag >= DATUM_MIN && tag <= datumMax(now)
}
