// Filialen des Mandanten (Feature `filialen`) — gelesen vom Reiter «Filialen» und von
// der Auswahl im Personalstamm. TanStack Query mit dem gemeinsamen Client, wie
// `admin/operative/useSkillPillen.ts` (refactoring-wachstum.md §19).
import { useQuery } from '@tanstack/react-query'
import { getFilialen, type FilialenListe } from '../../api/admin/filialen'
import { queryClient } from '../../shared/queryClient'

export const FILIALEN_KEY = ['admin', 'filialen'] as const

export function useFilialen(aktiv: boolean) {
  return useQuery<FilialenListe>({
    queryKey: FILIALEN_KEY,
    queryFn: getFilialen,
    enabled: aktiv,
  }, queryClient)
}

/** Nach dem Speichern: Reiter und Personalstamm lesen neu. */
export function filialenNeuLaden(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: FILIALEN_KEY })
}
