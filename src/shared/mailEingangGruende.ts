/**
 * Warum eine Mail im Mail-Eingang **nicht ausgewertet** wurde — Beschriftungen
 * der Zähler aus docs/specs/mail-eingang-triage.md §6.4.
 *
 * Über Abgewiesenes speichert der Server nur einen Zähler je Tag und Grund
 * (keine Adresse, kein Betreff). Die Zähler stehen an zwei Orten: über der
 * Liste im Eingang des Büros und im Reiter «Mail-Eingang» der Betreiber-Seite —
 * dort fällt auf, wenn die Domain-Liste falsch gepflegt ist. Deshalb `shared/`.
 *
 * Die Texte sind so gebaut, dass sie hinter «3 × » stehen können.
 */
export const GRUND_LABELS: Record<string, string> = {
  absender_fehlt: 'ohne Absender',
  fremde_domain: 'nicht aus den Domains des Betriebs',
  echtheit_unbestaetigt: 'Absender nicht vom Mailsystem bestätigt',
  adresse_unbekannt: 'kein aktives Konto und keine Funktionsadresse',
  automatisch: 'automatische Antwort oder Massenmail',
  ausgeschlossen: 'Personal oder Privates — nicht ausgewertet',
  irrelevant: 'nichts für Werkora',
  tageslimit: 'Tagesgrenze erreicht',
}

export interface AbgewiesenZaehler {
  grund: string
  anzahl: number
}

/** Ein unbekannter Grund bleibt sichtbar (als Schlüssel), statt zu verschwinden. */
export function grundLabel(grund: string): string {
  return GRUND_LABELS[grund] ?? grund
}

/** «3 × nicht aus den Domains des Betriebs» je Grund — Leeres fällt weg, Häufigstes zuerst. */
export function abgewiesenTeile(abgewiesen: readonly AbgewiesenZaehler[] | null | undefined): string[] {
  return [...(abgewiesen ?? [])]
    .filter(a => a.anzahl > 0)
    .sort((a, b) => b.anzahl - a.anzahl)
    .map(a => `${a.anzahl} × ${grundLabel(a.grund)}`)
}

/**
 * Die Zeile über der Liste: «In den letzten 7 Tagen nicht ausgewertet: 3 × …, 1 × …».
 * `null`, wenn nichts abgewiesen wurde — dann steht dort nichts.
 */
export function abgewiesenZeile(
  abgewiesen: readonly AbgewiesenZaehler[] | null | undefined, tage: number,
): string | null {
  const teile = abgewiesenTeile(abgewiesen)
  if (teile.length === 0) return null
  const zeitraum = tage === 1 ? 'Am letzten Tag' : tage > 1 ? `In den letzten ${tage} Tagen` : 'Zuletzt'
  return `${zeitraum} nicht ausgewertet: ${teile.join(', ')}`
}
