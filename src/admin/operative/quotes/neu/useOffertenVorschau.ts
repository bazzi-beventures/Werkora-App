// Live-Kalkulation der Maske «Offerte neu» (docs/specs/offerte-neu.md §3).
//
// Gerechnet wird im Backend (`POST /admin/quotes/preview`) über denselben Weg wie
// beim Speichern — ein zweiter Rechner im Browser liefe früher oder später neben dem
// PDF her. Der Payload ist derselbe wie für `createQuote`; die Abfrage wartet, bis
// eine Weile nicht getippt wurde (`VERZOEGERUNG_MS`), und behält die letzte Antwort,
// solange die nächste rechnet — die Summenleiste springt sonst bei jedem Tastendruck
// auf «—».
//
// TanStack Query mit dem gemeinsamen Client, ausdrücklich übergeben (Wurzel-CLAUDE.md
// «Datenzugriff im Frontend»).
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { previewQuote, type QuotePayload, type QuotePreview } from '../../../../api/admin/quotes'
import { queryClient } from '../../../../shared/queryClient'

export const VERZOEGERUNG_MS = 450

export interface OffertenVorschau {
  vorschau: QuotePreview | undefined
  /** Eine neuere Rechnung läuft; die angezeigte ist die vorige. */
  rechnet: boolean
  /** Letzte Rechnung fehlgeschlagen (Netz, 403 ohne Beta-Häkchen, 404 Projekt). */
  fehler: boolean
  /** Die angezeigte Antwort gehört zu einer früheren Eingabe (z. B. anderes Projekt). */
  vorlaeufig: boolean
}

/** Wartet `ms` nach der letzten Änderung, bevor der Wert weitergeht. Verglichen wird
 *  über JSON — der Payload ist bei jedem Rendern ein neues Objekt. */
export function useVerzoegert<T>(wert: T, ms: number): T {
  const schluessel = JSON.stringify(wert)
  const [stand, setStand] = useState(wert)
  useEffect(() => {
    const t = setTimeout(() => setStand(JSON.parse(schluessel) as T), ms)
    return () => clearTimeout(t)
  }, [schluessel, ms])
  return stand
}

/** `payload` null = noch kein Projekt gewählt, es wird nichts gerechnet. */
export function useOffertenVorschau(payload: QuotePayload | null): OffertenVorschau {
  const stand = useVerzoegert(payload, VERZOEGERUNG_MS)
  const { data, isFetching, isError, isPlaceholderData } = useQuery({
    queryKey: ['offerte-neu', 'vorschau', stand],
    queryFn: ({ signal }) => previewQuote(stand as QuotePayload, signal),
    enabled: stand !== null,
    placeholderData: keepPreviousData,
    // Jede Eingabe ist ein eigener Schlüssel; alte Rechnungen braucht niemand mehr.
    gcTime: 30_000,
  }, queryClient)
  return { vorschau: data, rechnet: isFetching, fehler: isError, vorlaeufig: isPlaceholderData }
}
