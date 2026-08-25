// Gruppierung der Offertenliste nach Projekt.
//
// Reine Funktion wie sortProjects.ts nebenan: die Reihenfolge kommt vom Backend
// (neueste Offerte zuerst, `GET /pwa/quotes`), eine Gruppe erbt die Position ihrer
// ersten Offerte — hier wird NICHT umsortiert. Ausgelagert, damit die Gruppierung
// ohne gerendertes DOM prüfbar ist; im Screen selbst war sie nur über die Optik
// zu erwischen.

export interface GroupableQuote {
  project_name: string
}

export interface QuoteGroup<Q> {
  /** Projektname, roh. Leer = Offerte ohne Projekt (Skelett-Projekte aus dem
   *  Offerten-Backfill). Die Beschriftung entscheidet der Screen — eine reine
   *  Funktion soll keine Anzeigetexte erfinden. */
  project: string
  quotes: Q[]
}

export function groupQuotesByProject<Q extends GroupableQuote>(quotes: Q[]): QuoteGroup<Q>[] {
  const groups: QuoteGroup<Q>[] = []
  const indexByProject = new Map<string, number>()
  for (const q of quotes) {
    const key = q.project_name || ''
    let idx = indexByProject.get(key)
    if (idx === undefined) {
      idx = groups.length
      indexByProject.set(key, idx)
      groups.push({ project: key, quotes: [] })
    }
    groups[idx].quotes.push(q)
  }
  return groups
}

/** «1 Offerte» / «3 Offerten» — die Angabe unter dem Projektnamen. Bei Varianten
 *  und Mehrfach-Offerten hängen an einem Projekt regelmässig mehrere Angebote. */
export function quoteCountLabel(count: number): string {
  return count === 1 ? '1 Offerte' : `${count} Offerten`
}
