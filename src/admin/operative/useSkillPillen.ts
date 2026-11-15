// Skill-Pillen der Einsatzplanung (Spec mitarbeiterdisposition-faehigkeiten-routen.md
// §4): wer für einen Einsatz passt, markiert an den Team-Chips. Fehlt etwas, bleibt
// die Markierung einfach weg — geplant wird wie bisher.
//
// Erster Screen-Teil auf TanStack Query (Charge O2, refactoring-wachstum.md §8.1).
// Bis dahin luden `useScheduleData` die Pillen selbst: beim ersten Öffnen und im
// langsamen Takt. Dasselbe tut jetzt die Abfrage — beim Einhängen und alle 60 s, nur
// bei sichtbarem Tab und nicht, solange eine Rückfrage offen ist. Neu ist nur der
// Cache: wer die Einsatzplanung wieder öffnet, sieht die Pillen sofort statt nach dem
// Abruf (der trotzdem läuft, `staleTime` 0).
import { useQuery } from '@tanstack/react-query'
import { getAllProjectSkills, getSkillMatrix, type Skill, type StaffSkill } from '../../api/admin/skills'
import { queryClient } from '../../shared/queryClient'
import { SLOW_REFRESH_MS } from './scheduleScreenModel'

export const SKILL_PILLEN_KEY = ['einsatzplanung', 'skill-pillen'] as const

export interface SkillPillen {
  skillKatalog: Skill[]
  staffPillen: StaffSkill[]
  projektPillen: Map<string, string[]>
}

const LEER: SkillPillen = { skillKatalog: [], staffPillen: [], projektPillen: new Map() }

/** Ein Abruf. Ein Netz- oder Serverfehler wirft — die Abfrage behält dann, was sie
 *  hatte. Eine unerwartete Antwort heisst «keine Pillen», nie ein Absturz der Tafel:
 *  `skillKatalog` wird beim Rendern gelesen, ein `undefined` legte die Ansicht lahm. */
export async function ladeSkillPillen(): Promise<SkillPillen> {
  const [m, p] = await Promise.all([getSkillMatrix(), getAllProjectSkills()])
  const projektPillen = new Map<string, string[]>()
  for (const r of Array.isArray(p?.project_skills) ? p.project_skills : []) {
    projektPillen.set(r.project_id, [...(projektPillen.get(r.project_id) ?? []), r.skill_id])
  }
  return {
    skillKatalog: Array.isArray(m?.skills) ? m.skills : [],
    staffPillen: Array.isArray(m?.cells) ? m.cells : [],
    projektPillen,
  }
}

export function useSkillPillen({ pausiert }: { pausiert: boolean }): SkillPillen {
  const { data } = useQuery({
    queryKey: SKILL_PILLEN_KEY,
    queryFn: ladeSkillPillen,
    // Der langsame Takt der Tafel: nur bei sichtbarem Tab, nicht während einer Rückfrage.
    refetchInterval: pausiert ? false : SLOW_REFRESH_MS,
    refetchIntervalInBackground: false,
  }, queryClient)
  return data ?? LEER
}
