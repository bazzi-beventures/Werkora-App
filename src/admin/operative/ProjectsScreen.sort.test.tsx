import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjectsScreen from './ProjectsScreen'
import { listProjects } from '../../api/admin/projects'

// Spec: docs/specs/projektliste-filter-sortierung.md §8 Schritt 3.
// Offerte, Rechnung und Projektleiter waren die drei Spalten ohne Sortierung —
// nicht aus Nachlaessigkeit, sondern weil die Belege frueher erst NACH dem
// Sortieren an die Zeile kamen. Seit die Liste den View liest, sortiert die
// Datenbank ueber den ganzen Bestand; getestet wird hier, dass der Klick den
// richtigen Schluessel schickt (die Reihenfolge selbst macht Postgres).

vi.mock('../../api/admin/projects', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/admin/projects')>()
  return { ...actual, listProjects: vi.fn(), getProject: vi.fn(), listProjectLocalities: vi.fn().mockResolvedValue([]) }
})
vi.mock('../../api/admin/staff', () => ({
  getAdminStaff: vi.fn().mockResolvedValue([{ id: 's-1', name: 'Marcin', projektleiter: true }]),
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
// Projektleiter-Spalte haengt an einem Feature-Flag — fuer diesen Test an.
vi.mock('../../api/modules', () => ({ isFeatureEnabled: (_me: unknown, key: string) => key === 'projektleiter_spalte' }))
vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const mockList = vi.mocked(listProjects)

const EMPTY = {
  rows: [], total: 0, open_count: 0, closed_count: 0, archived_count: 0, page: 1, page_size: 50,
}

beforeEach(() => {
  // Der Screen merkt sich Sortierung und Filter im sessionStorage (useListState).
  // Ohne Leeren traegt jeder Test den Stand des vorherigen mit — und ein Klick,
  // der sortieren soll, drehte dann nur die Richtung um.
  sessionStorage.clear()
  mockList.mockReset()
  mockList.mockResolvedValue(EMPTY)
})

// .at(-1) steht in dieser tsconfig-Lib noch nicht zur Verfuegung.
function letzterAufruf() {
  return mockList.mock.calls[mockList.mock.calls.length - 1][0]
}

async function klickAufSpalte(name: RegExp) {
  render(<ProjectsScreen />)
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  fireEvent.click(await screen.findByRole('columnheader', { name }))
  await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThan(1))
  return letzterAufruf()
}

describe('ProjectsScreen — Sortierung nach Offerte/Rechnung/Projektleiter', () => {
  it('startet unsortiert nach Erstelldatum, neueste zuerst', async () => {
    render(<ProjectsScreen />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(mockList.mock.calls[0][0]).toMatchObject({ sort: 'created_at', dir: 'desc' })
  })

  it('sortiert nach dem Stand der Offerte', async () => {
    expect(await klickAufSpalte(/^Offerte/)).toMatchObject({ sort: 'quote', dir: 'asc' })
  })

  it('sortiert nach dem Stand der Rechnung', async () => {
    expect(await klickAufSpalte(/^Rechnung/)).toMatchObject({ sort: 'invoice', dir: 'asc' })
  })

  it('sortiert nach dem Projektleiter', async () => {
    expect(await klickAufSpalte(/^Projektleiter/)).toMatchObject({ sort: 'projektleiter', dir: 'asc' })
  })

  it('dreht die Richtung beim zweiten Klick auf dieselbe Spalte', async () => {
    render(<ProjectsScreen />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    // Der Kopf wird nach dem ersten Klick neu gerendert (Sortierpfeil) — die alte
    // Node haengt dann nicht mehr im Dokument und nimmt keinen Klick mehr an.
    fireEvent.click(await screen.findByRole('columnheader', { name: /^Rechnung/ }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ sort: 'invoice', dir: 'asc' }))
    fireEvent.click(await screen.findByRole('columnheader', { name: /^Rechnung/ }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ sort: 'invoice', dir: 'desc' }))
  })

  it('springt beim Sortieren zurueck auf Seite 1', async () => {
    // Sonst zeigt die erste Seite nach dem Klick die Mitte der neuen Reihenfolge.
    mockList.mockResolvedValue({ ...EMPTY, total: 500 })
    render(<ProjectsScreen />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ page: 2 }))
    fireEvent.click(screen.getByRole('columnheader', { name: /^Offerte/ }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ sort: 'quote', page: 1 }))
  })
})
