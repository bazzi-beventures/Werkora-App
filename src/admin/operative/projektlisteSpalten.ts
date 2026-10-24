// Eingeblendete Zusatzspalten der Projektliste (docs/specs/projektliste-termine-team.md §2.2).
//
// localStorage statt sessionStorage: die Vorliebe soll den Tab überdauern —
// wer die Termine einmal ausgeblendet hat, will sie morgen nicht wieder sehen.
// Bewusst ein Objekt statt eines einzelnen Bools: ein späterer Spalten-Picker
// hängt weitere Schlüssel an, ohne Key-Wechsel. Der Key steht in
// api/storageMigrations.ts (isKnownKey, v22 → v23).

export const PROJEKTLISTE_SPALTEN_KEY = 'projektliste-spalten'

export interface ProjektlisteSpalten {
  /** Spalte «Termine» (Default an: «immer alle aktuellen Termine»). */
  termine: boolean
}

export const DEFAULT_SPALTEN: ProjektlisteSpalten = { termine: true }

export function readSpalten(): ProjektlisteSpalten {
  try {
    const raw = localStorage.getItem(PROJEKTLISTE_SPALTEN_KEY)
    if (!raw) return DEFAULT_SPALTEN
    const parsed = JSON.parse(raw) as Partial<ProjektlisteSpalten> | null
    return {
      termine: typeof parsed?.termine === 'boolean' ? parsed.termine : DEFAULT_SPALTEN.termine,
    }
  } catch {
    // Kaputter Wert oder gesperrter Speicher (privates Fenster): Default.
    return DEFAULT_SPALTEN
  }
}

export function writeSpalten(spalten: ProjektlisteSpalten): void {
  try {
    localStorage.setItem(PROJEKTLISTE_SPALTEN_KEY, JSON.stringify(spalten))
  } catch {
    // Ohne Speicher gilt der Schalter nur bis zum Neuladen — kein Fehler wert.
  }
}
