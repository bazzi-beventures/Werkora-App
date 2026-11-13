import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OverdueProjectsModal } from './OverdueProjectsModal'
import { getOverdueProjects, type OverdueProject } from '../../api/admin'

// Spec docs/specs/kachel-projekte-ueberfaellig.md §2.1/§3.2.
//
// Befund 12.11.2026: Kachel 492, Dialog «Alle (484)» — die Kachel stand auf dem
// Stand vom letzten Dashboard-Laden. Der Dialog meldet seine Zahl jetzt nach
// oben. Und ein Lesefehler darf nie wie «Keine überfälligen Projekte» aussehen.

vi.mock('../../api/admin', async () => {
  const echt = await vi.importActual<Record<string, unknown>>('../../api/admin')
  return { ...echt, getOverdueProjects: vi.fn() }
})

function projekt(over: Partial<OverdueProject> = {}): OverdueProject {
  return {
    id: 'p1', name: 'Hofmann Seuzach HS', customer_name: 'Kurt Hofmann',
    start_date: '2026-09-08', end_date: '2026-09-08', start_time: '07:30', end_time: '09:00',
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('OverdueProjectsModal', () => {
  it('meldet die frisch geladene Anzahl an die Kachel', async () => {
    vi.mocked(getOverdueProjects).mockResolvedValue([projekt(), projekt({ id: 'p2' })])
    const onCount = vi.fn()
    render(<OverdueProjectsModal onClose={vi.fn()} onChanged={vi.fn()} onCount={onCount} />)
    expect(await screen.findByText('Alle (2)')).toBeTruthy()
    expect(onCount).toHaveBeenCalledWith(2)
  })

  it('zeigt bei einem Lesefehler einen Fehler, nicht «Keine überfälligen Projekte»', async () => {
    vi.mocked(getOverdueProjects).mockRejectedValue(new Error('500'))
    const onCount = vi.fn()
    render(<OverdueProjectsModal onClose={vi.fn()} onChanged={vi.fn()} onCount={onCount} />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Keine überfälligen Projekte')).toBeNull()
    expect(onCount).not.toHaveBeenCalled()
  })

  it('zeigt ein unplausibles Jahr als «Datum prüfen» statt als Tageszahl (Befund 0206)', async () => {
    vi.mocked(getOverdueProjects).mockResolvedValue([projekt({ start_date: '0206-09-08', end_date: '0206-09-08' })])
    render(<OverdueProjectsModal onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText(/Datum prüfen: 08\.09\.0206/)).toBeTruthy()
    expect(screen.queryByText(/Tage überfällig/)).toBeNull()
  })

  it('trennt «Überfällig» von «Abschlussreif» und meldet nur die Überfälligen an die Kachel (§3.3)', async () => {
    vi.mocked(getOverdueProjects).mockResolvedValue([
      projekt({ id: 'u1', gruppe: 'ueberfaellig' }),
      projekt({ id: 'a1', name: 'Fertig nie geschlossen', gruppe: 'abschlussreif' }),
      projekt({ id: 'a2', name: 'Auch fertig', gruppe: 'abschlussreif' }),
    ])
    const onCount = vi.fn()
    render(<OverdueProjectsModal onClose={vi.fn()} onChanged={vi.fn()} onCount={onCount} />)
    expect(await screen.findByText(/Überfällig \(1\)/)).toBeTruthy()
    expect(screen.getByText(/Abschlussreif \(2\)/)).toBeTruthy()
    expect(onCount).toHaveBeenCalledWith(1)
    // Abschlussreif: kein Termin zum Verschieben, nur Schliessen.
    expect(screen.getAllByText('Speichern')).toHaveLength(1)
    expect(screen.getAllByText('Projekt schliessen')).toHaveLength(3)
  })

  it('zeigt das letzte Termin-Ende und bietet bei mehreren Terminen «Termine öffnen» statt der Felder (§3.4)', async () => {
    vi.mocked(getOverdueProjects).mockResolvedValue([
      projekt({ start_date: '2026-08-19', end_date: '2026-08-19', last_end: '2026-10-14', termin_count: 2 }),
    ])
    const onOpenProject = vi.fn()
    render(<OverdueProjectsModal onClose={vi.fn()} onChanged={vi.fn()} onOpenProject={onOpenProject} />)
    expect(await screen.findByText(/Letzter Termin 14\.10\.2026/)).toBeTruthy()
    expect(screen.queryByText('Speichern')).toBeNull()
    expect(screen.queryByLabelText('Start')).toBeNull()
    fireEvent.click(screen.getByText('Termine öffnen'))
    expect(onOpenProject).toHaveBeenCalledWith('p1')
  })
})
