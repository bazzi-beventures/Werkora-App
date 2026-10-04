// Vor- und Nachname im Kundenstamm (Feature-Anfrage WF-5, Migration 20261004).
//
// Bis 20261004 gab es nur das Feld «Name», und jeder Erfasser wählte seine
// eigene Reihenfolge: «Muster», «Muster Peter», «Peter Muster». Seitdem werden
// die Teile getrennt erfasst; `name` bleibt die Anzeige und wird vom Server aus
// ihnen gebaut (db.compose_customer_name — diese Datei spiegelt die Regel nur
// für die Vorschau im Formular).
//
// Den Altbestand teilt niemand automatisch auf: aus «Muster Peter» lässt sich
// nicht ablesen, welcher Teil der Vorname ist — genau das war das Problem. Das
// Formular bietet die Aufteilung deshalb als Vorschlag an, entscheiden tut der
// Mensch, der den Kunden kennt.

import type { Customer } from '../../api/admin/customers'

/** «Peter Muster» — Spiegel von db.compose_customer_name. */
export function composeCustomerName(first: string, last: string): string {
  return [first, last]
    .map(p => p.split(/\s+/).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
}

/** Steht der Kunde noch unaufgeteilt im Stamm (beide Teile leer, nur `name`)? */
export function isUnsplitCustomer(c: Pick<Customer, 'name' | 'first_name' | 'last_name'>): boolean {
  return !c.first_name && !c.last_name && !!c.name?.trim()
}

/** Startwerte des Formulars. Unaufgeteilt landet der ganze Name im Nachnamen —
 *  so ändert ein Speichern ohne Zutun am Namen nichts. */
export function initialNameParts(
  c: Pick<Customer, 'name' | 'first_name' | 'last_name'> | null,
): { first: string; last: string } {
  if (!c) return { first: '', last: '' }
  if (isUnsplitCustomer(c)) return { first: '', last: c.name.trim() }
  return { first: c.first_name ?? '', last: c.last_name ?? '' }
}

// Woran man einen Firmen- statt Personennamen erkennt. Für «Huber GmbH» wäre
// der Vorschlag «Vorname Huber, Nachname GmbH» nur Rauschen. Bewusst grob: im
// Zweifel kommt eben kein Vorschlag, der Hinweis darüber bleibt trotzdem.
const FIRMA = /&|\+|\b(ag|gmbh|sa|sàrl|sarl|kg|co|genossenschaft|verwaltung|stiftung|immobilien|verein|gemeinde)\b/i

export interface NameSplit {
  first: string
  last: string
}

/**
 * Aufteilungs-Vorschläge für einen unaufgeteilten Namen.
 *
 * Nur bei genau zwei Wörtern: dann gibt es genau zwei Lesarten, und beide
 * werden angeboten — welche stimmt, weiss nur, wer den Kunden kennt. Bei drei
 * und mehr Wörtern («Hans Peter Muster», «Anna von Allmen») gibt es zu viele,
 * und eine falsche Auswahl wäre schlimmer als keine.
 */
export function suggestNameSplits(name: string): NameSplit[] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length !== 2 || FIRMA.test(name)) return []
  const [a, b] = words
  return [
    { first: b, last: a },   // «Muster Peter» → Vorname Peter, Nachname Muster
    { first: a, last: b },   // «Peter Muster» → Vorname Peter, Nachname Muster
  ]
}
