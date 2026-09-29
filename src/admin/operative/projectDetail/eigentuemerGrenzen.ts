import type { Eigentuemer } from '../../../api/admin/projects'

/**
 * Höchstlängen der Eigentümer-Felder — dieselben Zahlen wie
 * `EIGENTUEMER_MAX` in agents/routers/admin_projects.py.
 *
 * Anlass (2026-09-28): im Namen stand der ganze Text der Projektseite, vom
 * Kopf der Seitenleiste bis zur Überschrift «Eigentümer», und landete so im
 * Kopf einer Rechnung. Kein echter Name und keine Adresse kommt in die Nähe.
 *
 * Bewusst KEIN `maxLength` am Eingabefeld: das kürzte einen eingefügten
 * Seitentext still auf 120 Zeichen und speicherte den Müll trotzdem. Hier wird
 * stattdessen gesagt, was nicht stimmt, und das Speichern angehalten.
 */
export const EIGENTUEMER_MAX: Record<keyof Eigentuemer, number> = {
  name: 120,
  adresse: 200,
  telefon: 40,
  email: 120,
}

const LABEL: Record<keyof Eigentuemer, string> = {
  name: 'Name',
  adresse: 'Adresse',
  telefon: 'Telefon',
  email: 'E-Mail',
}

/** Meldung für ein einzelnes Feld, oder `null`, wenn es passt. */
export function eigentuemerFeldFehler(feld: keyof Eigentuemer, wert: string | null | undefined): string | null {
  const laenge = (wert ?? '').trim().length
  const grenze = EIGENTUEMER_MAX[feld]
  if (laenge <= grenze) return null
  return `Eigentümer – ${LABEL[feld]}: höchstens ${grenze} Zeichen, eingetragen sind ${laenge}. `
    + 'Wurde versehentlich Text hineinkopiert?'
}

/** Erste Meldung über alle Felder, oder `null`. Für die Prüfung vor dem Speichern. */
export function eigentuemerFehler(e: Eigentuemer | null | undefined): string | null {
  if (!e) return null
  for (const feld of Object.keys(EIGENTUEMER_MAX) as (keyof Eigentuemer)[]) {
    const fehler = eigentuemerFeldFehler(feld, e[feld])
    if (fehler) return fehler
  }
  return null
}
