// Personal → Skill-Matrix. Spec docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4, §13.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StaffRolesScreen from './StaffRolesScreen'
import { apiFetch } from '../../api/client'
import type { SkillMatrix } from '../../api/admin'

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))

const mockFetch = vi.mocked(apiFetch)

const MATRIX: SkillMatrix = {
  skills: [
    { id: 'k1', key: 'griesser', label: 'Griesser', art: 'lieferant', requires_validity: false, einsatz_kinds: [], sort_order: 0, is_active: true },
    { id: 'k2', key: 'geruest', label: 'Gerüst', art: 'taetigkeit', requires_validity: true, einsatz_kinds: [], sort_order: 1, is_active: true },
    { id: 'k3', key: 'alt', label: 'Altes Zeug', art: 'taetigkeit', requires_validity: false, einsatz_kinds: [], sort_order: 2, is_active: false },
  ],
  staff: [{ id: 's1', name: 'Peter Muster', funktion: 'Monteur' }, { id: 's2', name: 'Anna Beispiel', funktion: null }],
  cells: [{ staff_id: 's1', skill_id: 'k2', valid_until: '2026-10-01', note: null, ablauf: 'abgelaufen' }],
  heute: '2026-10-11',
}

type Route = (path: string, body: unknown, method: string) => unknown
function route(fn: Route) {
  mockFetch.mockImplementation(async (path: string, opts?: RequestInit) =>
    fn(path, JSON.parse(String(opts?.body ?? '{}')), opts?.method ?? 'GET') as never)
}

async function oeffneTab() {
  render(<StaffRolesScreen />)
  await userEvent.click(screen.getByRole('button', { name: 'Skill-Matrix' }))
  return (await screen.findByText('Peter Muster')).closest('li') as HTMLElement
}

describe('Skill-Matrix', () => {
  // Klammern: ein zurückgegebener Mock wäre für Vitest eine Aufräum-Funktion.
  beforeEach(() => { mockFetch.mockReset() })

  it('zeigt die Pillen je Mitarbeiter und markiert ein abgelaufenes Zertifikat', async () => {
    route(path => (path.includes('skill-matrix') ? MATRIX : []))
    const peter = await oeffneTab()
    const pille = within(peter).getByText('Gerüst').closest('.skill-pill') as HTMLElement
    expect(pille.className).toContain('skill-pill-abgelaufen')
    expect(within(peter).getByText('bis 01.10.2026')).toBeTruthy()
    // Im Katalog steht auch die inaktive Pille — zum Wieder-Einschalten.
    expect(screen.getByDisplayValue('Altes Zeug')).toBeTruthy()
  })

  it('einen Skill anheften speichert für sich', async () => {
    const puts: { path: string; body: unknown }[] = []
    route((path, body, method) => {
      if (method === 'PUT') {
        puts.push({ path, body })
        return { staff_id: 's1', skill_id: 'k1', valid_until: null, note: null, ablauf: null, aktiv: true }
      }
      return path.includes('skill-matrix') ? MATRIX : []
    })
    const peter = await oeffneTab()
    await userEvent.click(within(peter).getByRole('button', { name: 'Bearbeiten' }))
    await userEvent.click(within(peter).getByRole('button', { name: '+ Griesser' }))
    await waitFor(() => expect(puts).toEqual([
      { path: '/pwa/admin/skill-matrix/s1/k1', body: { aktiv: true, valid_until: null } },
    ]))
    expect(within(peter).getByRole('button', { name: '✓ Griesser' })).toBeTruthy()
  })

  it('Fehler beim Speichern stellt den alten Stand her', async () => {
    route((path, _b, method) => {
      if (method === 'PUT') throw new Error('Kaputt')
      return path.includes('skill-matrix') ? MATRIX : []
    })
    const peter = await oeffneTab()
    await userEvent.click(within(peter).getByRole('button', { name: 'Bearbeiten' }))
    await userEvent.click(within(peter).getByRole('button', { name: '+ Griesser' }))
    expect(await screen.findByText('Kaputt')).toBeTruthy()
    expect(within(peter).getByRole('button', { name: '+ Griesser' })).toBeTruthy()
  })

  it('Filter «Wer kann …» zeigt nur, wer den Skill hat (abgelaufen zählt nicht)', async () => {
    route(path => (path.includes('skill-matrix') ? MATRIX : []))
    await oeffneTab()
    const filter = document.querySelector('.skill-filter') as HTMLElement
    await userEvent.click(within(filter).getByRole('button', { name: 'Gerüst' }))
    expect(screen.queryByText('Peter Muster')).toBeNull()
    expect(screen.queryByText('Anna Beispiel')).toBeNull()
    expect(within(filter).getByText(/0 von 2/)).toBeTruthy()
  })

  it('legt einen Skill als Tätigkeit an, der fürs Ausmass nötig ist', async () => {
    const posts: unknown[] = []
    route((path, body, method) => {
      if (method === 'POST') { posts.push(body); return { ...MATRIX.skills[0], id: 'k9' } }
      return path.includes('skill-matrix') ? MATRIX : []
    })
    await oeffneTab()
    await userEvent.type(screen.getByLabelText('Neuer Skill'), 'Ausmessen')
    const form = document.querySelector('.skill-neu') as HTMLElement
    await userEvent.selectOptions(within(form).getByLabelText('Art'), 'taetigkeit')
    await userEvent.click(within(form).getByLabelText('fürs Ausmass'))
    await userEvent.click(within(form).getByRole('button', { name: '+ Skill' }))
    await waitFor(() => expect(posts).toEqual([
      { label: 'Ausmessen', art: 'taetigkeit', requires_validity: false, einsatz_kinds: ['aufmass'] },
    ]))
  })
})

describe('Skills verwalten', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('«fürs Ausmass» schaltet nur den Ausmass-Eintrag', async () => {
    const patches: unknown[] = []
    route((path, body, method) => {
      if (method === 'PATCH') { patches.push({ path, body }); return MATRIX.skills[0] }
      return path.includes('skill-matrix') ? MATRIX : []
    })
    await oeffneTab()
    await userEvent.click(screen.getByLabelText('Griesser fürs Ausmass'))
    await waitFor(() => expect(patches).toEqual([{ path: '/pwa/admin/skills/k1', body: { einsatz_kinds: ['aufmass'] } }]))
  })
})
