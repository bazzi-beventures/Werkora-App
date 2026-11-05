// Suche in der Einsatzplanung (WW-69): «direkt mittels Eingabe des Namens auf den
// Termin kommen». Durchsucht werden genau die Einträge, die der Kalender zeichnet
// (calendarEntries des Screens) — also nur, was der Projektleiter-Filter zeigt, und
// das geladene Fenster von gut einem Jahr zurück bis anderthalb Jahre voraus.
// Ein eigener Such-Endpoint wäre für dieselbe Liste ein zweiter Weg zu denselben Daten.
//
// Gesucht wird wie im Projekt-Picker (projectPicker.ts): mehrere Wörter als UND, in
// beliebiger Reihenfolge, über Projektnummer + Name, Kunde und Objektadresse.
// Monteur-Namen bewusst nicht: «Marty» listete sonst jeden Einsatz eines Monteurs,
// und für «zeig mir seinen Plan» gibt es den Klick auf den Namen (WW-68).
//
// Reihenfolge: zuerst, was noch kommt (nächster Termin oben), danach Vergangenes
// (jüngstes oben). Wer nach «Macri» sucht, will fast immer den nächsten Termin.

import type { CalendarEntry } from './scheduleShared'
import { addressLocality, entryTitle, isVorschlag } from './scheduleShared'
import { projectCustomerName } from '../utils/project'

export interface ScheduleHit {
  entry: CalendarEntry
  title: string
  // «Kunde · Ort», leer wenn beides fehlt.
  detail: string
  upcoming: boolean
}

export const SEARCH_MIN_CHARS = 2

export function searchScheduleEntries(
  entries: CalendarEntry[], query: string, todayIso: string,
): ScheduleHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < SEARCH_MIN_CHARS) return []
  const tokens = q.split(/\s+/)

  const hits: ScheduleHit[] = []
  for (const e of entries) {
    if (isVorschlag(e.id) || !e.start_date) continue
    const title = entryTitle(e)
    const customer = projectCustomerName(e)
    const haystack = [title, customer, e.object_name ?? '', e.object_address ?? '']
      .join(' ').toLowerCase()
    if (!tokens.every(t => haystack.includes(t))) continue
    const end = (e.end_date ?? e.start_date).slice(0, 10)
    const locality = addressLocality(e.object_address)
    hits.push({
      entry: e,
      title,
      detail: [customer, locality].filter(Boolean).join(' · '),
      upcoming: end >= todayIso,
    })
  }

  const key = (h: ScheduleHit) => `${(h.entry.start_date ?? '').slice(0, 10)} ${h.entry.start_time ?? ''}`
  return hits.sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1
    return a.upcoming ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))
  })
}
