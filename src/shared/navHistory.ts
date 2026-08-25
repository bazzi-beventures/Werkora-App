// Verlauf der besuchten Ansichten — die Logik hinter «Zurück führt zur vorherigen
// View» (statt wie früher pauschal zur Hauptmaske).
//
// Rein und ohne React: die App hält den Verlauf im State und ruft hier nur
// `advance`/`retreat`. So ist das Verhalten unit-testbar, ohne einen ganzen
// Screen-Baum zu rendern.
//
// Der Verlauf enthält NUR die verlassenen Ansichten, nie die aktuelle — die steht
// im jeweiligen Screen-State (`screen` in App.tsx, `screen`+`detailId` im Admin).

// Deckel gegen unbegrenztes Wachstum. Greift praktisch nie: `advance` schneidet
// Rundwege ohnehin weg (siehe unten). Er ist das Sicherheitsnetz für den Fall,
// dass jemand später Einträge mit wechselnden Detail-IDs durchschleust —
// 20 Ebenen drückt niemand von Hand zurück.
const MAX_DEPTH = 20

/**
 * Neuer Verlauf beim Wechsel von `from` nach `to`.
 *
 * Der interessante Teil ist der Rundweg: Wer von Home nach Projekte und wieder
 * zurück auf Home tippt, hat den Hinweg bereits rückgängig gemacht. Würde man
 * stumpf anhängen, läge Projekte im Verlauf und Zurück auf Home führte wieder
 * hin — man käme durch Drücken von «Zurück» vorwärts. Darum: steht `to` schon
 * im Verlauf, wird bis dorthin abgeschnitten statt angehängt.
 *
 * Genau das hält den Verlauf bei einer App mit fester Nav-Leiste flach — ohne
 * den Schnitt sammelt das Hin-und-Her zwischen zwei Reitern beliebig viele
 * Einträge an, und «Zurück» wird zur Klickorgie.
 */
export function advance<T>(
  history: readonly T[],
  from: T,
  to: T,
  isSame: (a: T, b: T) => boolean = Object.is,
): T[] {
  // Kein echter Wechsel (z.B. Nav-Leiste auf den aktiven Reiter): nichts merken.
  if (isSame(from, to)) return [...history]

  const seen = history.findIndex(entry => isSame(entry, to))
  if (seen >= 0) return history.slice(0, seen)

  return [...history, from].slice(-MAX_DEPTH)
}

/**
 * Einen Schritt zurück. Liefert den gekürzten Verlauf und die Ansicht, die
 * angezeigt werden soll — `previous: undefined` heisst «Wurzel erreicht,
 * es gibt nichts mehr zurück».
 */
export function retreat<T>(history: readonly T[]): { history: T[]; previous: T | undefined } {
  if (history.length === 0) return { history: [], previous: undefined }
  return { history: history.slice(0, -1), previous: history[history.length - 1] }
}
