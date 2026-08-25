// Einmal-Übergabe «aufgezogenes Zeitfenster + Monteur» von der Einsatzplanung an
// die Neu-Projekt-Maske.
//
// Warum ein Modul-Wert und keine Prop: der Sprung läuft über
// `onNav(screen, detailId)` in AdminApp, und `detailId` ist ein einzelner
// String ('new' oder eine Projekt-id). Ein Payload-Kanal müsste durch AdminApp
// und jede der ~20 Nav-Aufrufstellen gezogen werden — für eine Übergabe, die
// genau einen Render später wieder erledigt ist.
//
// Konsum ist bewusst zerstörend (`take…`): der Entwurf soll GENAU EINMAL
// vorbelegt werden. Ohne das würde die nächste, von Hand geöffnete Neu-Maske
// die Zeiten von vorhin erben. Ein Reload leert den Wert ohnehin — es liegt
// nichts im localStorage, also auch keine APP_DATA_VERSION-Migration nötig.

export interface NewProjectPrefill {
  /** ISO 'YYYY-MM-DD' */
  startDate: string
  /** ISO 'YYYY-MM-DD'; gleich startDate = eintägig */
  endDate: string
  /** 'HH:MM' */
  startTime: string
  endTime: string
  /** Monteur(e) aus der angeklickten Plantafel-Zeile; leer in Ansichten ohne Zeile. */
  monteurIds: string[]
}

let pending: NewProjectPrefill | null = null

/** Setzt die Vorbelegung für die nächste Neu-Maske. `null` verwirft sie. */
export function setNewProjectPrefill(prefill: NewProjectPrefill | null): void {
  pending = prefill
}

/** Liest die Vorbelegung und leert sie im selben Zug. */
export function takeNewProjectPrefill(): NewProjectPrefill | null {
  const prefill = pending
  pending = null
  return prefill
}
