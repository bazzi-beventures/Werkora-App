/**
 * Gerüstfächer eines Projekts (Feature «geruestfach»): ein Projekt kann Material
 * in mehreren Fächern des Gerüstlagers haben, jedes aus Ziffern und Buchstaben
 * («2C», «14»). Nicht zu verwechseln mit dem Lagerort der Inventur.
 *
 * Das Muster steht wortgleich in services/geruestfach.py (Backend) und im CHECK
 * der Migration 20260930_mehrere_geruestfaecher.sql. Wer es ändert, zieht alle
 * drei nach.
 */
export const GERUESTFACH_PATTERN = /^[0-9A-Z]{1,8}$/
export const MAX_GERUESTFAECHER = 20

/** Ein Fach in Normalform («2c» → «2C») oder `null`, wenn es ungültig ist. */
export function normalizeGeruestfach(raw: string): string | null {
  const value = raw.replace(/\s+/g, '').toUpperCase()
  return GERUESTFACH_PATTERN.test(value) ? value : null
}

/**
 * Freitext aus dem Eingabefeld in Fächer zerlegen. Getrennt wird an Komma,
 * Semikolon und Leerzeichen — «2C, 14 3a» ergibt drei Fächer. `invalid` hält
 * fest, was nicht dem Muster entspricht, damit die Maske es anzeigen kann statt
 * es still zu verschlucken.
 */
export function parseGeruestfaecherInput(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []
  for (const part of raw.split(/[,;\s]+/)) {
    if (!part) continue
    const fach = normalizeGeruestfach(part)
    if (fach === null) invalid.push(part)
    else if (!valid.includes(fach)) valid.push(fach)
  }
  return { valid, invalid }
}

/** Neue Fächer anhängen — ohne Duplikate, Reihenfolge bleibt, Obergrenze gilt. */
export function addGeruestfaecher(current: string[], added: string[]): string[] {
  const result = [...current]
  for (const fach of added) {
    if (result.length >= MAX_GERUESTFAECHER) break
    if (!result.includes(fach)) result.push(fach)
  }
  return result
}

/** Anzeige für die Monteur-App: «2C · 14». Leer, wenn keine Fächer gepflegt sind. */
export function formatGeruestfaecher(faecher: string[] | null | undefined): string {
  return (faecher ?? []).join(' · ')
}
