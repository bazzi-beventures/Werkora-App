// useScheduleData: die Skill-Pillen lädt seit Charge O2 die eigene Abfrage
// (useSkillPillen, TanStack Query) — ein Neu-Laden nach einer eigenen Änderung
// (loadAll) holt sie nicht noch einmal.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../../api/admin', () => ({
  getScheduleStand: vi.fn(async () => null),
  listAppointments: vi.fn(async () => []),
  listScheduleAbsences: vi.fn(async () => []),
}))
vi.mock('../../api/admin/projects', () => ({ getScheduleProjects: vi.fn(async () => []) }))
vi.mock('../../api/admin/staff', () => ({ getAdminStaff: vi.fn(async () => []) }))
vi.mock('../../api/admin/hagelschadenDispo', () => ({ getVorschlaege: vi.fn(async () => ({ vorschlaege: [] })) }))
vi.mock('../../api/admin/skills', () => ({
  getSkillMatrix: vi.fn(async () => ({
    skills: [{ id: 's1', label: 'Elektro' }],
    cells: [{ staff_id: 'm1', skill_id: 's1' }],
  })),
  getAllProjectSkills: vi.fn(async () => ({ project_skills: [{ project_id: 'p1', skill_id: 's1' }] })),
}))

import { getSkillMatrix } from '../../api/admin/skills'
import { useScheduleData } from './useScheduleData'

describe('useScheduleData — Skill-Pillen', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('liefert die Pillen gleich nach dem Öffnen', async () => {
    const { result } = renderHook(() => useScheduleData({
      hagelVorschlaege: false, showToast: vi.fn(), pausiert: false,
    }))
    await act(async () => { await result.current.loadAll() })
    await waitFor(() => expect(result.current.skillKatalog).toEqual([{ id: 's1', label: 'Elektro' }]))
    expect(result.current.projektPillen.get('p1')).toEqual(['s1'])
  })

  it('lädt sie nach einer eigenen Änderung nicht erneut', async () => {
    const { result } = renderHook(() => useScheduleData({
      hagelVorschlaege: false, showToast: vi.fn(), pausiert: false,
    }))
    await act(async () => { await result.current.loadAll() })
    await waitFor(() => expect(result.current.skillKatalog).toHaveLength(1))
    await act(async () => { await result.current.loadAll() })
    expect(getSkillMatrix).toHaveBeenCalledTimes(1)
  })
})
