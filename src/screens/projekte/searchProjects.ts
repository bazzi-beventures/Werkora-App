// Suche über "Meine Projekte" (Mitarbeiter-PWA).
//
// Bewusst KEIN Tenant-Feature: das Suchfeld steht bei jedem Mandanten über der
// Liste. Bei drei Kacheln kostet es eine Zeile Platz, bei dreissig ist es der
// Unterschied zwischen "finden" und "scrollen" — und mit dem Flag
// `projects_show_all_to_staff` (alle offenen Projekte des Mandanten) ist die
// Liste ohnehin zu lang, um sie durchzublättern.
//
// Gesucht wird über **Name und Projektnummer**, weil das die beiden Angaben
// sind, die der Monteur von der Baustelle mitbringt: den Namen sagt ihm der
// Kunde, die Nummer steht auf dem Auftragsblatt. Der Kundenname ist bewusst
// nicht dabei — er steht zwar auf der Kachel, doppelt sich aber über hunderte
// Projekte und schwemmt die Trefferliste voll.
//
// Reine Funktion ohne React: hier liegt die Logik, die der Screen nur noch
// anwendet — und die sich testen lässt, ohne einen Screen zu rendern.

export interface SearchableProject {
  name: string
  // Projektnummer ("2600559"). Kann bei Alt-Zeilen fehlen.
  project_id_text?: string | null
}

// Normalisierung beider Seiten: Kleinschreibung, und Diakritika weg (NFD +
// Combining Marks). "Müller" muss auch auf "muller" anspringen — die Tastatur
// mit Handschuhen auf dem Bau trifft den Umlaut nicht zuverlässig. Das ß bleibt
// unverändert; in Schweizer Projektnamen kommt es praktisch nicht vor, und ein
// Sonderfall dafür wäre mehr Regel als Nutzen.
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Alle Suchbegriffe müssen vorkommen (UND), Reihenfolge egal.
 *
 *  "muller 2600" findet damit "Müller Kleinandelfingen" mit der Nummer 2600559,
 *  ohne dass der Monteur wissen muss, was zuerst kommt. Ein leerer Begriff
 *  (nur Leerzeichen) lässt die Liste unverändert. */
export function projectMatchesSearch(project: SearchableProject, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalize(`${project.name} ${project.project_id_text ?? ''}`)
  return terms.every(t => haystack.includes(t))
}

/** Gefilterte Kopie der Liste; leerer/blanker Begriff gibt sie unverändert zurück. */
export function filterProjectsBySearch<P extends SearchableProject>(
  projects: P[],
  query: string,
): P[] {
  if (!query.trim()) return projects
  return projects.filter(p => projectMatchesSearch(p, query))
}
