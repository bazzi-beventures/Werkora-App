// Projekt-Detail → Skill-Pillen. Spec docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectSkillsBlock } from './ProjectSkillsBlock'
import { apiFetch } from '../../../api/client'
import type { ProjectSkills, Skill } from '../../../api/admin'

vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))

const mockFetch = vi.mocked(apiFetch)

const SKILLS: Skill[] = [
  { id: 'aus', key: 'ausmessen', label: 'Ausmessen', art: 'taetigkeit', requires_validity: false, einsatz_kinds: ['aufmass'], sort_order: 0, is_active: true },
  { id: 'gri', key: 'griesser', label: 'Griesser', art: 'lieferant', requires_validity: false, einsatz_kinds: [], sort_order: 1, is_active: true },
]

function antwort(ids: string[]): ProjectSkills {
  return {
    skill_ids: ids,
    naechster_einsatz: 'aufmass',
    einsaetze: [
      { kind: 'aufmass', benoetigt: ['aus'], mitarbeiter: [{ staff_id: 's1', name: 'Peter', passt: true, fehlt: [] }] },
      { kind: 'montage', benoetigt: ids, mitarbeiter: [{ staff_id: 's1', name: 'Peter', passt: ids.length === 0, fehlt: ids }] },
    ],
  }
}

describe('ProjectSkillsBlock', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('Ausmass ist der nächste Einsatz ohne Offerte, Montage zeigt, wem ein Skill fehlt', async () => {
    const puts: unknown[] = []
    let ids: string[] = []
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (path === '/pwa/admin/skills') return { skills: SKILLS } as never
      if (opts?.method === 'PUT') { ids = JSON.parse(String(opts.body)).skill_ids; puts.push(ids); return { skill_ids: ids } as never }
      return antwort(ids) as never
    })
    render(<ProjectSkillsBlock projectId="p1" />)
    expect(await screen.findByText('nächster Einsatz — noch keine Offerte')).toBeTruthy()
    expect(screen.getByText('passt: Peter')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '+ Griesser' }))
    await waitFor(() => expect(puts).toEqual([['gri']]))
    const montage = screen.getByText('Montage').closest('li') as HTMLElement
    expect(await within(montage).findByText(/niemand hat alle Skills — am nächsten: Peter \(fehlt Griesser\)/)).toBeTruthy()
  })
})
