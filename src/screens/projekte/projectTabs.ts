// Reiter «Aktuell» / «Bearbeitet» in "Meine Projekte" (Mitarbeiter-PWA).
//
// Die Einteilung macht der Server (`bearbeitet` je Zeile, siehe
// agents/routers/admin_projects.py::split_monteur_projects): Aktuell sind die
// Einsätze, auf denen der Monteur eingeplant ist und die noch nicht erledigt sind;
// Bearbeitet sind erledigte Projekte (Rapport oder Rechnung, kein offener Termin)
// und jedes offene Projekt, auf dem er Stunden rapportiert hat. Hier liegt nur,
// was der Screen daraus macht — als reine Funktion testbar.
//
// Fehlt das Feld (Offline-Snapshot von vor den Reitern), gilt das Projekt als
// aktuell: so sah die Liste vorher aus, und nichts verschwindet.

export type ProjektReiter = 'aktuell' | 'bearbeitet'

export interface TabbableProject {
  bearbeitet?: boolean
}

export function reiterOf(project: TabbableProject): ProjektReiter {
  return project.bearbeitet === true ? 'bearbeitet' : 'aktuell'
}

/** Die Projekte eines Reiters, Reihenfolge unverändert. */
export function projectsForTab<P extends TabbableProject>(projects: P[], reiter: ProjektReiter): P[] {
  return projects.filter(p => reiterOf(p) === reiter)
}

/** Anzahl je Reiter — für die Beschriftung und den Hinweis auf den anderen Reiter. */
export function countByTab(projects: TabbableProject[]): Record<ProjektReiter, number> {
  const out: Record<ProjektReiter, number> = { aktuell: 0, bearbeitet: 0 }
  for (const p of projects) out[reiterOf(p)] += 1
  return out
}

export const REITER_LABELS: Record<ProjektReiter, string> = {
  aktuell: 'Aktuell',
  bearbeitet: 'Bearbeitet',
}
