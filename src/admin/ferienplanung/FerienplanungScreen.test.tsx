import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiFetch } from '../../api/client'
import { queryClient } from '../../shared/queryClient'
import FerienplanungScreen from './FerienplanungScreen'

// Ferienplanung im Admin (docs/specs/ferienplanung.md §7.1): Plantafel, Antrag mit
// Befund, Freigabe trotz hartem Befund nur mit Begründung.

vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)

const BEFUND = {
  quelle: 'regel', regel_id: 'r1', art: 'gleichzeitig', haerte: 'hart', titel: 'Monteure: max. 1',
  tage: ['2027-07-14'], konkurrenz: [{ staff_id: 'b', name: 'Beat', status: 'approved' }], gesetz: null,
}

const PLANER = {
  von: '2027-07-01', bis: '2027-07-31',
  personen: [
    { id: 'a', name: 'Anna', funktion: 'Monteur', kanton: 'ZH', gruppen: ['g'] },
    { id: 'b', name: 'Beat', funktion: 'Monteur', kanton: 'ZH', gruppen: ['g'] },
  ],
  gruppen: [{ id: 'g', name: 'Monteure', art: 'funktion', status: 'aktiv' }],
  absenzen: [
    { id: 'x-a', staff_id: 'a', staff_name: 'Anna', type: 'vacation', status: 'requested',
      date_start: '2027-07-14', date_end: '2027-07-14', half_day: null },
    { id: 'x-b', staff_id: 'b', staff_name: 'Beat', type: 'vacation', status: 'approved',
      date_start: '2027-07-12', date_end: '2027-07-16', half_day: null },
  ],
  sperrfristen: [{ id: 's', titel: 'Hochsaison', art: 'sperre', haerte: 'weich', gruppe_ids: [], von: '2027-07-01', bis: '2027-07-05' }],
  feiertage: { ZH: [] },
  befunde: { 'x-a': [BEFUND] },
  zwei_wochen: { a: { 2027: 'fehlt' }, b: { 2027: 'geplant' } },
}

const STAMM = {
  gruppen: [{ id: 'g', name: 'Monteure', art: 'funktion', kriterium: ['Monteur'], status: 'aktiv', quelle: 'admin', mitglieder: ['a', 'b'] }],
  sperrfristen: [], regeln: [], personen: [{ id: 'a', name: 'Anna', funktion: 'Monteur' }, { id: 'b', name: 'Beat', funktion: 'Monteur' }],
  funktionen: ['Monteur'], vorlagen: [],
}

beforeEach(() => {
  queryClient.clear()
  mockFetch.mockReset().mockImplementation(async (pfad: string) => {
    if (pfad.startsWith('/pwa/admin/ferienplanung/planer')) return PLANER
    if (pfad === '/pwa/admin/ferienplanung/stammdaten') return STAMM
    return undefined
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-07-10T10:00:00'))
})

describe('FerienplanungScreen', () => {
  it('zeigt die Plantafel mit Zwei-Wochen-Status und lädt den Monatszeitraum', async () => {
    render(<FerienplanungScreen darfPflegen />)
    fireEvent.click(screen.getByRole('button', { name: 'Monat' }))
    expect(await screen.findByText('Anna')).toBeTruthy()
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/ferienplanung/planer?von=2027-07-01&bis=2027-07-31'))
    expect(screen.getByTitle('Noch keine zwei Wochen am Stück (OR 329c Abs. 1)')).toBeTruthy()
  })

  it('Antrag mit hartem Befund: Genehmigen nur mit Begründung', async () => {
    render(<FerienplanungScreen darfPflegen />)
    fireEvent.click(screen.getByRole('button', { name: 'Monat' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Anna: Ferien beantragt' }))
    expect(screen.getAllByText(/Monteure: max. 1/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '✓ Genehmigen' }))
    const bestaetigen = screen.getByRole('button', { name: 'Trotzdem genehmigen' })
    expect(bestaetigen).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Begründung'), { target: { value: 'Absprache mit Beat' } })
    fireEvent.click(bestaetigen)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/absences/x-a/approve', {
      method: 'POST', body: JSON.stringify({ override_grund: 'Absprache mit Beat' }),
    }))
  })

  it('ohne Recht keine Pflege-Knöpfe', async () => {
    render(<FerienplanungScreen darfPflegen={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gruppen' }))
    expect(await screen.findByText('Monteure')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Neue Gruppe' })).toBeNull()
  })
})
