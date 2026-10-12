import type { FeatureRegistryEntry } from '../../../api/admin'

// Suche im Workflows-Tab. Reine Funktion, damit sie ohne Rendern testbar ist.
//
// Durchsucht wird alles, was man von einem Eintrag kennen könnte: Titel,
// Schlüssel, Beschreibung, Kategorie und die Beschriftungen der Parameter
// (wer «Pauschale» tippt, sucht oft ein Feld, nicht den Eintrag). Mehrere
// Wörter müssen alle vorkommen — in beliebiger Reihenfolge und Feldern.

/** Klein, ohne Akzente, `_`/`-` wie Leerzeichen — «Pausenabzug», «pausenabzug»
 *  und «automatische pause» treffen damit auch `automatische_pause`. */
export function foldSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-/]+/g, ' ')
}

function haystack(entry: FeatureRegistryEntry): string {
  const parts: string[] = [entry.label, entry.key, entry.description ?? '', entry.category]
  for (const f of entry.schema ?? []) {
    parts.push(f.label ?? '')
    if (f.help) parts.push(f.help)
  }
  return foldSearch(parts.join(' \n '))
}

export function matchesWorkflowSearch(entry: FeatureRegistryEntry, query: string): boolean {
  const terms = foldSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = haystack(entry)
  return terms.every(t => hay.includes(t))
}
