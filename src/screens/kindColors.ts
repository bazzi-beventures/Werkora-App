import type { ProjectKind } from '../shared/projectDetail/types'

// Farben der Einsatz-Arten in der Mitarbeiter-PWA — eigene Palette.
//
// Die Beschriftungen (PROJECT_KIND_LABELS in shared/projectDetail/types) teilt
// sich die PWA mit der Verwaltung, die Farben bewusst nicht: die Verwaltung
// zeichnet ihre Pillen aus den --kind-*-Variablen der Tenant-Config
// (admin/operative/scheduleShared.ts).
//
// Geteilt wird sie zwischen den Monteur-Screens, die Einsatz-Arten zeigen:
// «Meine Projekte» und der Wochenplan. Zwei Kopien hiessen, dass ein neuer Typ
// in der einen Ansicht farbig und in der anderen grau wäre.
export const KIND_COLORS: Record<ProjectKind, string> = {
  project: 'var(--accent-amber)',
  teamsitzung: '#7c3aed',
  lagerarbeit: '#d97706',
  werkstatt: '#0d9488',
  weiterbildung: '#db2777',
  reservation: '#65a30d',
  blocker: '#94a3b8',
  sonstiges: '#475569',
}

/** Farbe zu einer Einsatz-Art; unbekannte Werte (ältere/neuere API) fallen auf
 *  die Projektfarbe zurück statt auf undefined. */
export function kindColor(kind: string | null | undefined): string {
  return KIND_COLORS[(kind || 'project') as ProjectKind] || KIND_COLORS.project
}
