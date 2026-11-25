// Stammdaten der Ferienplanung (Gruppen, Sperrfristen, Regeln, Personen, Vorlagen)
// über TanStack Query mit dem gemeinsamen Client (refactoring-wachstum.md §19).
import { useQuery } from '@tanstack/react-query'
import {
  getStammdaten, loescheZeile, speichereZeile, type FerienArt, type FerienStammdaten,
} from '../../api/admin/ferienplanung'
import { queryClient } from '../../shared/queryClient'
import { PLANER_KEY } from './Plantafel'

export const STAMMDATEN_KEY = ['ferienplanung', 'stammdaten'] as const

export function useFerienStammdaten() {
  return useQuery<FerienStammdaten>({ queryKey: STAMMDATEN_KEY, queryFn: getStammdaten }, queryClient)
}

async function neuLaden(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: STAMMDATEN_KEY }),
    queryClient.invalidateQueries({ queryKey: PLANER_KEY }),
  ])
}

export async function speichern(art: FerienArt, daten: Record<string, unknown>, id?: string, mitglieder?: string[]) {
  await speichereZeile(art, daten, id, mitglieder)
  await neuLaden()
}

export async function loeschen(art: FerienArt, id: string) {
  await loescheZeile(art, id)
  await neuLaden()
}
