/**
 * Reine Aggregationshelfer für die Kennzahlen-Tabs.
 *
 * Bewusst ohne React/DOM — unit-getestet (`aggregate.test.ts`), nach dem
 * Vorbild von `pipelineAggregation.ts`.
 *
 * Warum es das gibt: die Karten des Finanzen-Tabs summierten mit
 * `rows.reduce((s, r) => s + r.wert, 0)`. Fehlte die Spalte in der View, war
 * `r.wert` `undefined`, `0 + undefined` ergibt `NaN` — und weil
 * `typeof NaN === 'number'` ist, kam das durch jeden Formatter-Guard hindurch
 * und stand als **„CHF NaN"** auf dem Bildschirm (Screenshot 2026-08-27).
 * Ein einzelner Helfer, der `null` liefert statt `NaN`, macht diesen Fehler
 * strukturell unmöglich — er lässt sich nicht mehr aus Versehen anders
 * schreiben.
 */

/** Endliche Zahl oder null — `NaN`, `Infinity`, `undefined` und Strings fallen raus. */
export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Summe über eine Spalte — `null`, sobald **ein** Wert fehlt.
 *
 * Das ist dieselbe Ehrlichkeits-Regel, die die KPI-Views seit Migration
 * 20260815 verfolgen: lieber „—" als eine Zahl, die niemand als unvollständig
 * erkennt. Eine stillschweigend zu tiefe Kostensumme macht aus jedem Projekt
 * einen Gewinner.
 *
 * Eine leere Liste ergibt `0` — kein Aufwand ist eine bekannte Null, keine
 * Lücke.
 */
export function sumOrNull<T>(rows: readonly T[], pick: (row: T) => unknown): number | null {
  let total = 0
  for (const row of rows) {
    const value = finite(pick(row))
    if (value === null) return null
    total += value
  }
  return total
}

/**
 * Summe über mehrere Spalten je Zeile (z. B. `marge_arbeit + marge_material`).
 * Fehlt in einer Zeile einer der Summanden, ist das Ergebnis `null`.
 */
export function sumFieldsOrNull<T>(
  rows: readonly T[],
  picks: readonly ((row: T) => unknown)[],
): number | null {
  let total = 0
  for (const row of rows) {
    for (const pick of picks) {
      const value = finite(pick(row))
      if (value === null) return null
      total += value
    }
  }
  return total
}

/** Grösster Markerwert über alle Zeilen — untere Schranke für das Datenqualitäts-Banner. */
export function maxOrZero<T>(rows: readonly T[], pick: (row: T) => unknown): number {
  let max = 0
  for (const row of rows) {
    const value = finite(pick(row))
    if (value !== null && value > max) max = value
  }
  return max
}

/**
 * Mittelwert über die Zeilen, in denen der Wert vorhanden und > 0 ist.
 * `null`, wenn keine Zeile etwas beiträgt — nicht 0, denn „keine bezahlte
 * Rechnung" ist keine Laufzeit von null Tagen.
 */
export function averageOrNull<T>(rows: readonly T[], pick: (row: T) => unknown): number | null {
  let total = 0
  let count = 0
  for (const row of rows) {
    const value = finite(pick(row))
    if (value !== null && value > 0) {
      total += value
      count += 1
    }
  }
  return count ? total / count : null
}

/** Anteil in Prozent — `null`, wenn eine Seite fehlt oder die Basis 0 ist. */
export function percentOrNull(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole === 0) return null
  return (part / whole) * 100
}

/**
 * Ist ein Projekt fakturiert? Grundlage des Abrechnungs-Filters im Projekte-Tab.
 *
 * Warum das eine eigene Funktion ist: ein Projekt mit gebuchtem Aufwand, aber
 * noch ohne Rechnung, steht zwangsläufig im Minus — die Kosten sind da, der
 * Umsatz noch nicht. Solche Projekte fluteten die „Schwächste 5"-Liste und
 * machten sie nutzlos. Der Filter trennt sie ab, statt sie stillschweigend
 * mitzuzählen.
 */
export function istFakturiert(umsatzGestellt: unknown): boolean {
  return (finite(umsatzGestellt) ?? 0) > 0
}

/**
 * Freitext-Treffer über mehrere Felder — case-insensitiv, leerer Begriff
 * trifft alles.
 *
 * Die Projektnummer gehört mit in den Heuhaufen: `projects.name` ist seit
 * Migration 20260807b nicht mehr eindeutig, die Nummer ist der einzige
 * verlässliche Sucheinstieg.
 */
export function matchesSuche(begriff: string, felder: readonly (string | null | undefined)[]): boolean {
  const needle = begriff.trim().toLowerCase()
  if (!needle) return true
  return felder.filter(Boolean).join(' ').toLowerCase().includes(needle)
}

/**
 * Monatsbereich auf 'YYYY-MM'-Strings. Leere Grenzen sind offen.
 *
 * Lexikografischer Vergleich ist bei diesem Format korrekt und spart das
 * Date-Parsing — '2026-02' < '2026-10' stimmt als String wie als Datum.
 */
export function imMonatsbereich(jahrMonat: string, von: string, bis: string): boolean {
  if (von && jahrMonat < von) return false
  if (bis && jahrMonat > bis) return false
  return true
}
