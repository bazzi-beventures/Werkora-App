// Der ganze Kundenstamm für Auswahlfelder — aus dem gemeinsamen Zwischenspeicher
// (`api/admin/kundenstamm.ts`, dort die Herleitung). Ein Fehler beim Laden heisst
// «leere Auswahl» wie bisher; die Maske bleibt bedienbar.
import { useQuery } from '@tanstack/react-query'
import { getAllCustomers, type Customer } from '../../api/admin/customers'
import { KUNDENSTAMM_FRISCH_MS, KUNDENSTAMM_KEY } from '../../api/admin/kundenstamm'
import { queryClient } from '../../shared/queryClient'

const LEER: Customer[] = []

const abfrage = {
  queryKey: KUNDENSTAMM_KEY,
  queryFn: getAllCustomers,
  staleTime: KUNDENSTAMM_FRISCH_MS,
}

export function useKundenstamm(): Customer[] {
  const { data } = useQuery(abfrage, queryClient)
  return Array.isArray(data) ? data : LEER
}

/** Für Screens, die den Stamm einmal an einer bestimmten Stelle brauchen (Panel
 *  der Einsatzplanung, Vorbelegung in «Projekt anlegen») und ihren Ablauf um das
 *  Promise herum gebaut haben: liefert den frischen Speicher ohne Abruf, sonst
 *  holt es ihn und legt ihn für alle anderen ab. Fehler werfen wie der Abruf. */
export function ladeKundenstamm(): Promise<Customer[]> {
  return queryClient.fetchQuery(abfrage)
}
