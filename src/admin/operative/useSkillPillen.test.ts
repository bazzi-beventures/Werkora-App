// useSkillPillen (Charge O2): erster Screen-Teil auf TanStack Query. Gleicher Takt wie
// vorher in useScheduleData — dazu der Cache über das Wiederöffnen hinweg.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../api/admin/skills', () => ({
  getSkillMatrix: vi.fn(async () => ({
    skills: [{ id: 's1', label: 'Elektro' }],
    cells: [{ staff_id: 'm1', skill_id: 's1' }],
  })),
  getAllProjectSkills: vi.fn(async () => ({
    project_skills: [{ project_id: 'p1', skill_id: 's1' }, { project_id: 'p1', skill_id: 's2' }],
  })),
}))

import { getAllProjectSkills, getSkillMatrix } from '../../api/admin/skills'
import { useSkillPillen } from './useSkillPillen'

describe('useSkillPillen', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('lädt beim Einhängen und gruppiert die Projekt-Pillen', async () => {
    const { result } = renderHook(() => useSkillPillen({ pausiert: false }))
    expect(result.current.skillKatalog).toEqual([])
    await waitFor(() => expect(result.current.skillKatalog).toEqual([{ id: 's1', label: 'Elektro' }]))
    expect(result.current.staffPillen).toEqual([{ staff_id: 'm1', skill_id: 's1' }])
    expect(result.current.projektPillen.get('p1')).toEqual(['s1', 's2'])
    expect(getSkillMatrix).toHaveBeenCalledTimes(1)
    expect(getAllProjectSkills).toHaveBeenCalledTimes(1)
  })

  it('zeigt beim Wiederöffnen sofort den Cache und lädt trotzdem neu', async () => {
    const erstes = renderHook(() => useSkillPillen({ pausiert: false }))
    await waitFor(() => expect(erstes.result.current.skillKatalog).toHaveLength(1))
    erstes.unmount()
    const zweites = renderHook(() => useSkillPillen({ pausiert: false }))
    expect(zweites.result.current.skillKatalog).toHaveLength(1)
    await waitFor(() => expect(getSkillMatrix).toHaveBeenCalledTimes(2))
  })

  it('eine unerwartete Antwort heisst «keine Pillen», nie ein Absturz', async () => {
    vi.mocked(getSkillMatrix).mockResolvedValueOnce({} as never)
    vi.mocked(getAllProjectSkills).mockResolvedValueOnce({} as never)
    const { result } = renderHook(() => useSkillPillen({ pausiert: false }))
    await waitFor(() => expect(getSkillMatrix).toHaveBeenCalled())
    await waitFor(() => expect(result.current.projektPillen.size).toBe(0))
    expect(result.current.skillKatalog).toEqual([])
    expect(result.current.staffPillen).toEqual([])
  })

  it('ein Serverfehler leert die Pillen nicht, die Tafel bleibt stehen', async () => {
    vi.mocked(getSkillMatrix).mockRejectedValueOnce(new Error('503'))
    const { result } = renderHook(() => useSkillPillen({ pausiert: false }))
    await waitFor(() => expect(getSkillMatrix).toHaveBeenCalled())
    expect(result.current.skillKatalog).toEqual([])
    expect(result.current.projektPillen.size).toBe(0)
  })
})
