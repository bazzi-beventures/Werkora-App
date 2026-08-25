// Reihenfolge der Einsätze in "Meine Projekte".
//
// Die Liste enthält *alle* offenen Projekte des Monteurs, auch länger
// zurückliegende. Aufsteigend sortiert stand deshalb der älteste Auftrag oben und
// der aktuelle ganz unten — der Monteur musste jedes Mal ans Listenende scrollen.
// Darum: **neuestes Datum zuerst**, Altes wandert nach unten.
//
// Innerhalb eines Tages bleibt es aufsteigend: ein Tag ist ein Tagesablauf, der
// von oben nach unten abgearbeitet wird (09:00 vor 11:00 vor 16:00). Nur die
// Tage untereinander drehen sich um.
//
// Das Backend liefert weiter aufsteigend (get_open_projects_for_tenant, dieselbe
// Liste versorgt auch die Offerten-Ansicht); die Umkehr passiert hier in der
// Ansicht, die ohnehin nach Datum gruppiert.

export interface SortableProject {
  name: string
  start_date: string | null
  start_time?: string | null
}

// Ohne Termin ans Ende — nicht an den Anfang: ein Projekt ohne Datum ist keine
// Aufgabe für "jetzt", sondern eines, das noch disponiert werden muss. Das gilt
// in beiden Sortierrichtungen, deshalb dreht die Umkehr unten nur den Vergleich
// zweier *gesetzter* Werte.
function compareNullsLast(a: string | null | undefined, b: string | null | undefined): number {
  const av = a || ''
  const bv = b || ''
  if (!av && !bv) return 0
  if (!av) return 1
  if (!bv) return -1
  return av.localeCompare(bv)
}

/** Datum absteigend (neuestes zuerst), ohne Datum ans Ende. */
function compareDatesNewestFirst(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return compareNullsLast(a, b)
  return b.localeCompare(a)
}

/** Datum (neuestes zuerst) → Startzeit (aufsteigend) → Name. Fehlt Datum bzw.
 *  Zeit, geht der Eintrag jeweils nach hinten. */
export function compareProjectsNewestFirst(a: SortableProject, b: SortableProject): number {
  // ISO-Strings (YYYY-MM-DD / HH:MM[:SS]) sind lexikografisch = chronologisch,
  // solange die Länge stimmt — "9:00" käme falsch, aus Postgres kommt aber
  // immer "09:00:00".
  const byDate = compareDatesNewestFirst(a.start_date, b.start_date)
  if (byDate !== 0) return byDate
  const byTime = compareNullsLast(a.start_time, b.start_time)
  if (byTime !== 0) return byTime
  return a.name.localeCompare(b.name, 'de-CH')
}

/** Kopie der Liste, neueste Einsätze zuerst (mutiert die Eingabe nicht). */
export function sortProjectsNewestFirst<P extends SortableProject>(projects: P[]): P[] {
  return [...projects].sort(compareProjectsNewestFirst)
}
