// Suche im Projekt-Picker der Einsatzplanung (Panel «Neuer Termin» /
// «Einsatz planen»).
//
// Warum eine eigene Datei: die Suche lief über `p.name` und den Kundennamen.
// Dass sich Projekte trotzdem über die Projektnummer finden liessen, war ein
// Zufall des Altbestands — die aus der Vorgänger-Software importierten Projekte
// tragen ihre Nummer IM Namen («241556 Gsell Seuzach»). Neu angelegte Projekte
// haben sie nur in `project_id_text`; nach ihrer Nummer zu suchen fand nichts,
// und in der Trefferliste stand sie auch nicht. Genau so sucht die Disposition
// aber: mit der Nummer vom Auftragszettel.
//
// Gesucht wird deshalb im Anzeige-Titel (entryTitle = Nummer + Name, ohne sie zu
// verdoppeln) und im Kundennamen — dieselbe Beschriftung, die die Liste zeigt.

import type { Project } from '../../api/admin/projects'
import { projectCustomerName } from '../utils/project'
import { entryTitle } from './scheduleShared'

/** Beschriftung eines Treffers: Projektnummer vor dem Namen, wie im Kalender. */
export function pickerLabel(p: Project): string {
  return entryTitle(p)
}

interface Ranked {
  project: Project
  rank: number
  sortKey: string
}

/**
 * Projekte für die Trefferliste filtern und sortieren.
 *
 * Mehrere Wörter zählen als UND-Verknüpfung über Titel + Kundenname, in
 * beliebiger Reihenfolge («seuzach gut» findet «251761 Gut Seuzach …»).
 * Sortiert wird nach Trefferqualität: was mit der Eingabe *beginnt*, steht
 * oben — die eingetippte Projektnummer landet damit auf Platz eins statt
 * irgendwo zwischen den Namenstreffern.
 */
export function filterPickerProjects(projects: Project[], query: string): Project[] {
  const q = query.trim().toLowerCase()
  const tokens = q ? q.split(/\s+/) : []

  const ranked: Ranked[] = []
  for (const p of projects) {
    const title = pickerLabel(p).toLowerCase()
    const haystack = `${title} ${projectCustomerName(p).toLowerCase()}`
    if (tokens.length && !tokens.every(t => haystack.includes(t))) continue
    const rank = !q || title.startsWith(q) ? 0 : title.includes(q) ? 1 : 2
    ranked.push({ project: p, rank, sortKey: pickerLabel(p) })
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || a.sortKey.localeCompare(b.sortKey, 'de-CH'))
    .map(r => r.project)
}
