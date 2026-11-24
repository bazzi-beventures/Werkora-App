// Der ganze Kundenstamm als gemeinsamer Zwischenspeicher (TanStack Query,
// refactoring-wachstum.md §19) — für die Auswahlfelder, die ihn im Browser
// durchsuchen: Kundenwahl und Kontakt-Vorschläge der Projektmaske, Kundenwahl
// der Offerte.
//
// Service-Status 24.11.2026: `GET /admin/customers` lief 1300-mal in 7 Tagen à
// 3.25 MB (4.2 GB), weil jede Projektmaske und jedes Offertenformular den Stamm
// beim Öffnen neu holte. Jetzt holt ihn der erste Screen, die folgenden lesen
// aus dem Speicher, bis er `FRISCH_MS` alt ist (dann im Hintergrund neu).
// Gespeichert oder gelöscht wird über `saveCustomer`/`deleteCustomer`, und die
// ziehen den Speicher selbst nach — sonst fehlte ein eben angelegter Kunde bis
// zum nächsten Abruf in der Auswahl.
import { queryClient } from '../../shared/queryClient'
import type { Customer } from './customers'

export const KUNDENSTAMM_KEY = ['admin', 'kundenstamm'] as const

/** So lange gilt der Stamm als frisch. Neue Kunden aus diesem Browser kommen
 *  sofort hinzu (`kundenstammEintragen`), nur Änderungen von anderswo warten so
 *  lange. */
export const KUNDENSTAMM_FRISCH_MS = 5 * 60_000

/** Angelegte oder geänderte Kunden in den Speicher übernehmen — nur wenn er schon
 *  geladen ist; sonst holt der nächste Screen ohnehin den aktuellen Stand. */
export function kundenstammEintragen(kunden: readonly Customer[]): void {
  if (!kunden.length) return
  queryClient.setQueryData<Customer[]>(KUNDENSTAMM_KEY, prev => {
    if (!prev) return prev
    const neu = new Map(kunden.map(k => [String(k.id), k]))
    const ersetzt = prev.map(k => neu.get(String(k.id)) ?? k)
    const bekannt = new Set(prev.map(k => String(k.id)))
    return [...ersetzt, ...kunden.filter(k => !bekannt.has(String(k.id)))]
  })
}

export function kundenstammEntfernen(id: string): void {
  queryClient.setQueryData<Customer[]>(KUNDENSTAMM_KEY, prev =>
    prev?.filter(k => String(k.id) !== String(id)))
}
