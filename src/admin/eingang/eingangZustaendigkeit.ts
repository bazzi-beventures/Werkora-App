/**
 * Reine Hilfen für Zuständigkeit im Eingang — ohne React, unit-getestet.
 *
 * Spec docs/specs/mail-eingang-zustaendigkeiten.md §6, §7, §9. Wer verantwortlich
 * ist, rechnet der Server aus dem heutigen Organigramm; hier wird nur gefiltert.
 *
 * Zwei Grenzen aus §9, die hier gelten:
 * - **Zuständigkeit sortiert, sie sperrt nicht** — nichts hier blendet eine Karte
 *   endgültig aus, «Alle» zeigt immer alles.
 * - **Der Filter nach Person gibt es nur unter «Offen»** — er zeigt einen
 *   Arbeitsvorrat, keine Leistung. Keine Zahlen je Person ausser der eigenen.
 */
import type {
  EingangItem, EingangStartansicht, EingangZustaendigkeit, EingangZustaendigkeiten,
} from '../../api/admin/mailEingang'

export const VERANTWORTLICH_ALLE = 'alle'
export const VERANTWORTLICH_MEINE = 'meine'
export const VERANTWORTLICH_NIEMAND = 'nicht_zugeteilt'

type MitAufgabe = Pick<EingangItem, 'aufgabe'>

function block(z: EingangZustaendigkeiten, aufgabe: string | null | undefined): EingangZustaendigkeit | null {
  return aufgabe ? z.aufgaben[aufgabe] ?? null : null
}

/** Bei wem eine Mail steht — leer heisst «nicht zugeteilt» (§6). */
export function verantwortlicheVon(item: MitAufgabe, z: EingangZustaendigkeiten): { ids: string[]; vertretung: boolean } {
  const b = block(z, item.aufgabe)
  return b && b.verantwortlich.length > 0 ? { ids: b.verantwortlich, vertretung: b.vertretung } : { ids: [], vertretung: false }
}

/** «Meine» = wofür ich verantwortlich bin, **plus** alles nicht Zugeteilte (§6). */
export function istMeine(item: MitAufgabe, z: EingangZustaendigkeiten, ich: string): boolean {
  const { ids } = verantwortlicheVon(item, z)
  return ids.length === 0 || ids.includes(ich)
}

export function filterNachVerantwortlich<T extends MitAufgabe>(
  items: readonly T[], wert: string, z: EingangZustaendigkeiten, ich: string,
): T[] {
  if (wert === VERANTWORTLICH_ALLE) return [...items]
  if (wert === VERANTWORTLICH_MEINE) return items.filter(i => istMeine(i, z, ich))
  if (wert === VERANTWORTLICH_NIEMAND) return items.filter(i => verantwortlicheVon(i, z).ids.length === 0)
  return items.filter(i => verantwortlicheVon(i, z).ids.includes(wert))
}

/** Personen für die Auswahl: wer für mindestens eine Aufgabe verantwortlich ist, nach Namen.
 *  **Ohne Zahl** neben dem Namen — die Auswahl ist kein Ranking (§7.1). */
export function personenImFilter(z: EingangZustaendigkeiten): { id: string; name: string }[] {
  const ids = new Set<string>()
  Object.values(z.aufgaben).forEach(b => b.verantwortlich.forEach(id => ids.add(id)))
  return [...ids]
    .map(id => ({ id, name: z.personen[id] ?? 'Ohne Namen' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id))
}

export function hatOrganigramm(z: EingangZustaendigkeiten): boolean {
  return Object.values(z.aufgaben).some(b => b.zustaendig.length + b.stellvertretung.length > 0)
}

/** Ein gemerkter Wert, der heute nicht mehr passt (Person nicht mehr im Organigramm),
 *  wird zu `null` — dann gilt wieder die Startansicht des Betriebs. */
export function gueltigerVerantwortlichFilter(
  wert: string | null | undefined, z: EingangZustaendigkeiten,
): string | null {
  if (!wert) return null
  if ([VERANTWORTLICH_ALLE, VERANTWORTLICH_MEINE, VERANTWORTLICH_NIEMAND].includes(wert)) return wert
  return personenImFilter(z).some(p => p.id === wert) ? wert : null
}

/** Womit der Filter steht: die Wahl dieser Sitzung, sonst die Startansicht (§7.3). */
export function verantwortlichFilter(
  wunsch: string | null, startansicht: EingangStartansicht, z: EingangZustaendigkeiten,
): string {
  return gueltigerVerantwortlichFilter(wunsch, z)
    ?? (startansicht === 'meine' ? VERANTWORTLICH_MEINE : VERANTWORTLICH_ALLE)
}

/** Teil der Überschrift: «bei dir», «bei Tina Caduff», «nicht zugeteilt» — `null` bei «alle». */
export function verantwortlichText(wert: string, z: EingangZustaendigkeiten): string | null {
  if (wert === VERANTWORTLICH_ALLE) return null
  if (wert === VERANTWORTLICH_MEINE) return 'bei dir'
  if (wert === VERANTWORTLICH_NIEMAND) return 'nicht zugeteilt'
  return `bei ${z.personen[wert] ?? 'Ohne Namen'}`
}

/** Zeile an der Karte: «Zuständig: Tina Caduff», «… (Vertretung)» oder «Nicht zugeteilt» (§7.2). */
export function zustaendigText(item: MitAufgabe, z: EingangZustaendigkeiten): string {
  const { ids, vertretung } = verantwortlicheVon(item, z)
  if (ids.length === 0) return 'Nicht zugeteilt'
  const namen = ids.map(id => z.personen[id] ?? 'Ohne Namen').join(', ')
  return `Zuständig: ${namen}${vertretung ? ' (Vertretung)' : ''}`
}

/** Satzteil der leeren Liste: «in deinen Aufgaben», «bei Tina Caduff in «Reparatur»» (§7.1). */
export function leerTeile(verantwortlich: string, aufgabeLabel: string | null, z: EingangZustaendigkeiten): string {
  const person = verantwortlich === VERANTWORTLICH_MEINE
    ? (aufgabeLabel ? 'bei dir' : 'in deinen Aufgaben')
    : verantwortlichText(verantwortlich, z)
  return [person, aufgabeLabel && `in «${aufgabeLabel}»`].filter(Boolean).join(' ')
}
