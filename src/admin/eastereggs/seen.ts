// Welche Meilensteine dieses Konto schon gefeiert hat.
//
// Bewusst im localStorage und nicht in der Datenbank: das Ei ist Dekoration.
// Eine Tabelle dafür wäre eine Migration, eine Spalte in `authorized_users` und
// ein Schreibpfad — alles, damit ein Konfetti nach dem Gerätewechsel nicht ein
// zweites Mal fällt. Der Preis der billigen Lösung steht damit fest und ist
// tragbar: wer die Admin-App auf einem neuen Gerät oder nach dem Leeren der
// Browserdaten öffnet, sieht den zuletzt erreichten Meilenstein noch einmal.
//
// Der Key trägt die Konto-id, weil sich mehrere Konten einen Browser teilen
// können (Büro-Rechner). Neuer Key, keine Migration: `APP_DATA_VERSION` in
// api/storageMigrations.ts bleibt, wo es ist — es gibt nichts zu migrieren,
// und ein fehlender Wert ist der gültige Normalfall (siehe unten).

import { SK_SUFFIX } from '../../api/storageKeys'

export type EggKind = 'projects' | 'revenue'

function key(kind: EggKind, userId: string): string {
  return `easteregg-${kind}:${userId}${SK_SUFFIX}`
}

/**
 * Ist dieser Meilenstein schon gefeiert worden?
 *
 * Verglichen wird mit `>=` und nicht auf Gleichheit: wer bei 100 Projekten
 * gefeiert hat und das Ei erst bei 300 wieder öffnet, soll die 200 nicht
 * nachgereicht bekommen — gefeiert wird der aktuelle Stand oder gar nichts.
 *
 * Ein nicht lesbarer Speicher (Privatmodus, gesperrte Site-Daten) gilt als
 * «noch nichts gesehen». Die andere Richtung wäre schlimmer: dann liefe das Ei
 * nie, und niemand fände heraus, warum.
 */
export function alreadySeen(kind: EggKind, userId: string, milestone: number): boolean {
  try {
    const raw = localStorage.getItem(key(kind, userId))
    if (raw === null) return false
    const seen = Number(raw)
    return Number.isFinite(seen) && seen >= milestone
  } catch {
    return false
  }
}

/**
 * Merkt den gefeierten Meilenstein. Schlägt das Schreiben fehl, passiert nichts
 * weiter — das Ei geht dann beim nächsten Start noch einmal auf, was die
 * harmlosere Fehlerrichtung ist.
 */
export function markSeen(kind: EggKind, userId: string, milestone: number): void {
  try {
    localStorage.setItem(key(kind, userId), String(milestone))
  } catch {
    /* Speicher voll oder gesperrt — kein Grund, irgendetwas abzubrechen. */
  }
}
