import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CountPlans from './CountPlans'
import { listCountPlans, runCountPlan } from '../../api/admin/inventory'
import type { CountPlan } from '../../api/admin/inventory'
import { ApiError } from '../../api/client'

// Spec docs/specs/rollierende-inventur.md E1, E4, §9, §11.
//
// Die zwei Regeln, die diese Datei festhält:
//
// 1. Eine offene Tranche blockiert nicht, sie wirft eine Frage auf —
//    abbrechen (nichts gebucht, Artikel zurück in den Pool) oder übernehmen
//    (Gezähltes buchen, Offenes nach vorne). Kein Automat entscheidet das.
// 2. Ohne Inventurmanager entstehen keine Tranchen, und die Karte sagt es.
//    Sonst wartet der Betrieb auf eine Zählung, die nie kommt.

vi.mock('../../api/admin/inventory', () => ({
  listCountPlans: vi.fn(),
  runCountPlan: vi.fn(),
  saveCountPlan: vi.fn(),
  deleteCountPlan: vi.fn(),
}))

vi.mock('../../api/admin', () => ({ listUsers: vi.fn().mockResolvedValue([]) }))

const mockListe = vi.mocked(listCountPlans)
const mockRun = vi.mocked(runCountPlan)

function plan(over: Partial<CountPlan> = {}): CountPlan {
  return {
    id: 'p1', active: true, per_period: 20, period: 'woche',
    weekday: 0, day_of_month: 1, category: null,
    manager_user_id: 'u1', manager_name: 'Peter Lagerist', manager_fehlt: false,
    last_generated_on: null, artikel: 800,
    zyklus: 'Bei 20 Artikeln pro Woche ist jeder der 800 Artikel etwa alle 40 Wochen dran.',
    naechste_tranche: '2026-09-28',
    offene_tranche: null,
    ...over,
  }
}

beforeEach(() => {
  mockListe.mockReset()
  mockRun.mockReset()
  mockListe.mockResolvedValue({
    plans: [plan()], kategorien_ohne_plan: ['Motoren'], sammelplan_vorhanden: true,
  })
})

describe('Zählpläne', () => {
  it('zeigt ohne Plan den Einstieg statt einer leeren Liste', async () => {
    mockListe.mockResolvedValue({
      plans: [], kategorien_ohne_plan: [], sammelplan_vorhanden: false,
    })
    render(<CountPlans onOeffnen={vi.fn()} />)
    expect(await screen.findByText(/Rollierende Inventur einrichten/)).toBeTruthy()
  })

  it('nennt den Zyklus — die Zahl, die aus «20 pro Woche» eine Entscheidung macht', async () => {
    render(<CountPlans onOeffnen={vi.fn()} />)
    expect(await screen.findByText(/alle 40 Wochen dran/)).toBeTruthy()
  })

  it('«Jetzt zählen» legt an und öffnet die Tranche', async () => {
    const oeffnen = vi.fn()
    mockRun.mockResolvedValue({
      count: { id: 'c2' } as never, positionen: 20,
    })
    render(<CountPlans onOeffnen={oeffnen} />)
    fireEvent.click(await screen.findByText('Jetzt zählen'))
    await waitFor(() => expect(oeffnen).toHaveBeenCalledWith('c2'))
    expect(mockRun).toHaveBeenCalledWith('p1', undefined)
  })

  it('wird bei offener Tranche zu «Weiterzählen»', async () => {
    mockListe.mockResolvedValue({
      plans: [plan({
        offene_tranche: {
          count_id: 'c1', title: 'Inventur KW 38', due_on: '2026-09-20',
          progress: { gezaehlt: 8, gesamt: 20 }, ueberfaellig: true,
        },
      })],
      kategorien_ohne_plan: [], sammelplan_vorhanden: true,
    })
    const oeffnen = vi.fn()
    render(<CountPlans onOeffnen={oeffnen} />)
    fireEvent.click(await screen.findByText('Weiterzählen'))
    expect(oeffnen).toHaveBeenCalledWith('c1')
    expect(screen.queryByText('Jetzt zählen')).toBeNull()
    expect(screen.getByText(/überfällig seit/)).toBeTruthy()
  })

  it('fragt vor einer neuen Tranche, was mit der offenen geschehen soll', async () => {
    mockListe.mockResolvedValue({
      plans: [plan({
        offene_tranche: {
          count_id: 'c1', title: 'Inventur KW 38', due_on: '2026-09-20',
          progress: { gezaehlt: 8, gesamt: 20 }, ueberfaellig: false,
        },
      })],
      kategorien_ohne_plan: [], sammelplan_vorhanden: true,
    })
    mockRun.mockResolvedValue({ count: { id: 'c2' } as never, positionen: 20, carried: 12 })

    render(<CountPlans onOeffnen={vi.fn()} />)
    fireEvent.click(await screen.findByText('Neue Tranche…'))

    // Beide Wege stehen gleichrangig da, mit ihren Folgen.
    expect(screen.getByText(/die 8 gezählten Positionen werden/)).toBeTruthy()
    expect(screen.getByText(/kommen zurück in den Pool/)).toBeTruthy()
    expect(mockRun).not.toHaveBeenCalled()

    // getByRole: «Übernehmen» steht auch im Erklärtext darüber.
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(mockRun).toHaveBeenCalledWith('p1', 'carry'))
  })

  it('reicht «Abbrechen und neu» als abort durch', async () => {
    mockListe.mockResolvedValue({
      plans: [plan({
        offene_tranche: {
          count_id: 'c1', title: 'Inventur KW 38', due_on: null,
          progress: { gezaehlt: 0, gesamt: 20 }, ueberfaellig: false,
        },
      })],
      kategorien_ohne_plan: [], sammelplan_vorhanden: true,
    })
    mockRun.mockResolvedValue({ count: { id: 'c2' } as never, positionen: 20 })

    render(<CountPlans onOeffnen={vi.fn()} />)
    fireEvent.click(await screen.findByText('Neue Tranche…'))
    fireEvent.click(screen.getByText('Abbrechen und neu'))
    await waitFor(() => expect(mockRun).toHaveBeenCalledWith('p1', 'abort'))
  })

  it('stellt die Frage auch, wenn der Server sie stellt', async () => {
    // Zwischen dem Laden der Karte und dem Klick kann eine Tranche entstanden
    // sein (Nachtlauf, zweiter Admin). Dann kommt die Frage vom Server.
    mockRun.mockRejectedValueOnce(new ApiError(409, 'Noch offen', 'open_tranche'))
    mockListe.mockResolvedValue({
      plans: [plan({
        offene_tranche: {
          count_id: 'c1', title: 'Inventur KW 39', due_on: null,
          progress: { gezaehlt: 3, gesamt: 20 }, ueberfaellig: false,
        },
      })],
      kategorien_ohne_plan: [], sammelplan_vorhanden: true,
    })

    render(<CountPlans onOeffnen={vi.fn()} />)
    fireEvent.click(await screen.findByText('Neue Tranche…'))
    expect(await screen.findByText('Neue Tranche starten?')).toBeTruthy()
  })

  it('sagt es, wenn der Inventurmanager fehlt — und sperrt das Zählen', async () => {
    mockListe.mockResolvedValue({
      plans: [plan({ manager_name: null, manager_fehlt: true })],
      kategorien_ohne_plan: [], sammelplan_vorhanden: true,
    })
    render(<CountPlans onOeffnen={vi.fn()} />)
    expect(await screen.findByText(/Inventurmanager fehlt/)).toBeTruthy()
    expect(screen.getByText('Jetzt zählen').closest('button')?.disabled).toBe(true)
  })
})
