import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Listenzustand (Suche, Filter, Sortierung, Seite), der einen Maskenwechsel und
 * ein F5 überlebt — aber nicht das Schliessen des Browsers.
 *
 * Warum überhaupt: `AdminApp` rendert die Screens über ein `switch`. Ein
 * Menüwechsel **unmountet** den Screen und wirft damit Suche, Filter, Sortierung
 * und Seitenzahl weg. Wer in der Projektliste auf Seite 7 nach "Rechnung
 * gesendet" filtert, kurz ins Dashboard springt und zurückkommt, fängt von vorne
 * an.
 *
 * Warum `sessionStorage` und nicht `localStorage`:
 *
 * - Ein Filter, der einen Monat später beim nächsten Login noch aktiv ist, ist
 *   die häufigste Ursache für "mein Projekt ist verschwunden". Mit
 *   `sessionStorage` fängt jede neue Sitzung neutral an.
 * - `localStorage`-Keys fallen unter die Regeln in `api/storageMigrations.ts`:
 *   neuer Key → `isKnownKey` ergänzen UND `APP_DATA_VERSION` hochziehen, sonst
 *   räumt der nächste Schema-Wechsel ihn weg. `sessionStorage` ist davon nicht
 *   betroffen — ein Wartungsschritt weniger, dauerhaft.
 *
 * Der Hook ist bewusst generisch: Kunden-, Material- und Rechnungslisten haben
 * dasselbe Problem und sollen ihn übernehmen können. Er weiss nichts über
 * Projekte.
 *
 * Gegenmassnahme gegen den unsichtbaren Filter ist die Chip-Zeile im Screen —
 * Persistenz ohne sichtbare Anzeige wäre eine Falle, kein Komfort.
 */

const PREFIX = 'list-state:'

/**
 * Liest den gespeicherten Zustand und legt ihn über die Vorgaben.
 *
 * Regeln (exportiert, weil sie ohne React testbar sein sollen):
 * - Kaputtes JSON, kein Storage (Privatmodus), fremder Shape → Vorgaben.
 * - Nur Schlüssel, die es in den Vorgaben gibt, werden übernommen — ein alter
 *   Eintrag aus einer früheren Version bringt keine unbekannten Felder mit.
 * - Der Typ muss passen (Array bleibt Array, String bleibt String): sonst
 *   stürzt der Screen an einer Stelle ab, die mit dem Storage nichts zu tun hat.
 * - `revive` darf zusätzlich fachlich prüfen (unbekannter Filterwert raus).
 */
export function readListState<T extends object>(
  key: string,
  defaults: T,
  revive?: (stored: Partial<T>) => Partial<T>,
): T {
  // Intern als Record gelesen: der Aufrufer soll ein sauberes Interface uebergeben
  // duerfen (ProjectsListState), nicht eines mit Index-Signatur.
  const defaultsRecord = defaults as Record<string, unknown>
  let raw: string | null
  try {
    raw = sessionStorage.getItem(PREFIX + key)
  } catch {
    return defaults
  }
  if (!raw) return defaults

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults

  const stored: Partial<T> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(k in defaultsRecord)) continue
    const fallback = defaultsRecord[k]
    if (Array.isArray(fallback)) {
      if (Array.isArray(v)) stored[k as keyof T] = v.filter(x => typeof x === 'string') as T[keyof T]
      continue
    }
    if (typeof v === typeof fallback) stored[k as keyof T] = v as T[keyof T]
  }
  return { ...defaults, ...(revive ? revive(stored) : stored) }
}

export interface ListState<T> {
  state: T
  /** Teilaktualisierung — wie `setState` einer Klassenkomponente. */
  patch: (values: Partial<T> | ((prev: T) => Partial<T>)) => void
  /** Zurück auf die Vorgaben (der "alle zurücksetzen"-Knopf der Chip-Zeile). */
  reset: () => void
}

export function useListState<T extends object>(
  key: string,
  defaults: T,
  revive?: (stored: Partial<T>) => Partial<T>,
): ListState<T> {
  // Lazy-Init: einmal beim Mount lesen. Ein Effect würde erst NACH dem ersten
  // Laden feuern — die Liste holte dann eine Seite mit den Vorgaben und gleich
  // darauf eine zweite mit dem gemerkten Zustand.
  const [state, setState] = useState<T>(() => readListState(key, defaults, revive))

  // Vorgaben und revive dürfen bei jedem Render neue Objekte sein (Inline-
  // Literale im Screen). Über Refs bleibt `patch`/`reset` trotzdem stabil.
  const defaultsRef = useRef(defaults)
  useEffect(() => { defaultsRef.current = defaults })

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(state))
    } catch {
      // Privatmodus/voller Storage: der Zustand lebt dann nur im RAM. Das ist
      // die richtige Reaktion — eine Liste darf daran nicht scheitern.
    }
  }, [key, state])

  const patch = useCallback((values: Partial<T> | ((prev: T) => Partial<T>)) => {
    setState(prev => ({ ...prev, ...(typeof values === 'function' ? values(prev) : values) }))
  }, [])

  const reset = useCallback(() => { setState(defaultsRef.current) }, [])

  return { state, patch, reset }
}
