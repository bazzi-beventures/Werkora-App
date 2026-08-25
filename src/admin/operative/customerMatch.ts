// Kundenzuordnung beim Konvertieren eines Projekt-Entwurfs.
//
// Der Mitarbeiter erfasst den Kunden vor Ort als Freitext ("Baumgartner Rolf und
// Sandra"). Beim Umwandeln in ein Projekt schlägt der Dialog einen Kunden aus dem
// Stamm vor. Der Vorschlag darf NIE stillschweigend gewinnen, wenn er nur geraten
// ist: ein falsch verknüpfter Kunde wandert bis auf die Rechnung durch.
//
// Die frühere Variante prüfte reine Teilstring-Enthaltung in beide Richtungen.
// Damit passte ein Stammkunde namens "A" auf *jeden* Entwurf (needle.includes("a")),
// wurde automatisch vorausgewählt — und der Admin bemerkte es nicht. Deshalb jetzt
// Token-Vergleich mit Mindestbelegen, und Auto-Übernahme nur beim exakten Treffer.

const STOPWORDS = new Set([
  'und', 'der', 'die', 'das', 'von', 'van', 'zur', 'zum',
  'herr', 'frau', 'fam', 'familie', 'erben',
  'ag', 'gmbh', 'sa', 'sarl', 'srl', 'kig', 'kg', 'co', 'ohg',
])

/** Kleinschreibung, Umlaute ausgeschrieben, alles Übrige zu einfachen Leerzeichen. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Namensbestandteile, die als Beleg taugen: keine Kürzel, keine Rechtsformen. */
function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

export interface CustomerMatch<T> {
  customer: T
  /** true = normalisiert identischer Name. Nur dann darf der Dialog vorauswählen. */
  exact: boolean
}

/**
 * Sucht den plausibelsten Kunden zum Freitext-Namen aus dem Entwurf.
 *
 * Ein Treffer braucht entweder zwei gemeinsame Namensbestandteile ("Baumgartner
 * Rolf") oder einen langen gemeinsamen Bestandteil, der eine Seite vollständig
 * abdeckt (Entwurf "Baumgartner Rolf und Sandra" ↔ Stammkunde "Baumgartner").
 * Ein einzelner Vorname reicht nie — "Meier Rolf" ist kein Beleg für
 * "Baumgartner Rolf".
 */
export function findCustomerMatch<T extends { name: string }>(
  name: string,
  customers: readonly T[],
): CustomerMatch<T> | null {
  const needle = normalize(name)
  if (!needle) return null

  const exact = customers.find(c => normalize(c.name) === needle)
  if (exact) return { customer: exact, exact: true }

  const needleTokens = tokens(name)
  if (needleTokens.length === 0) return null

  let best: T | null = null
  let bestScore = 0
  for (const c of customers) {
    const candTokens = tokens(c.name)
    if (candTokens.length === 0) continue
    const shared = candTokens.filter(t => needleTokens.includes(t))
    if (shared.length === 0) continue

    const coversOneSide = needleTokens.length === 1 || candTokens.length === 1
    const strongEnough =
      shared.length >= 2 ||
      (shared[0].length >= 5 && coversOneSide)
    if (!strongEnough) continue

    // Längere Belege wiegen schwerer; bei Gleichstand gewinnt der erste Fund.
    const score = shared.reduce((sum, t) => sum + t.length, 0)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  return best ? { customer: best, exact: false } : null
}
