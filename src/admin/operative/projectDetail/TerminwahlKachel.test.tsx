import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminwahlKachel } from './TerminwahlKachel'
import { apiFetch } from '../../../api/client'
import type { TerminwahlAnsicht } from '../../../api/serviceBegleitung'

// Kachel «Termin mit dem Kunden» (docs/specs/servicebegleitung.md §7, §8).

vi.mock('../../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)

const STAFF = [{ id: 's-1', name: 'Marco Keller' }]

function ansicht(over: Partial<TerminwahlAnsicht> = {}): TerminwahlAnsicht {
  return {
    anfragen: [], vorgabe_reserviert_bis: '2026-11-18T12:00', empfaenger_vorschlag: 'kunde@example.ch',
    kundenlink: 'https://api.example.ch/auftrag/abc', dauer_vorgaben: {}, ...over,
  }
}

const OFFEN = {
  id: 'a-1', status: 'offen' as const, grund: null, empfaenger: 'kunde@example.ch', reserviert_bis: '',
  reserviert_bis_text: 'Mittwoch, 18. November, 12:00 Uhr', gesendet_at: 'x', erinnert_at: null,
  hinweis_kunde: null, created_at: 'x', dauer_text: 'etwa 1 bis 2 Stunden',
  optionen: [{ id: 'o-1', datum: '2026-11-19', start: '08:00', ende: '10:00', monteur_ids: ['s-1'],
               status: 'reserviert' as const, text: 'Donnerstag, 19. November, 08:00–10:00 Uhr' }],
}

beforeEach(() => mockFetch.mockReset())

describe('TerminwahlKachel', () => {
  it('ohne Anfrage bietet sie das Senden an und füllt den Dialog vor', async () => {
    mockFetch.mockResolvedValueOnce(ansicht())
    render(<TerminwahlKachel projectId="p-1" staff={STAFF} terminwahl />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dem Kunden zur Wahl senden' }))
    expect(screen.getByLabelText('Empfänger E-Mail')).toHaveValue('kunde@example.ch')
    expect(screen.getByLabelText('Reserviert bis')).toHaveValue('2026-11-18T12:00')
    // Senden erst, wenn jedes Fenster Datum und Monteur hat.
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Fenster 2 entfernen' }))
    fireEvent.change(screen.getByLabelText('Fenster 1 Datum'), { target: { value: '2026-11-19' } })
    fireEvent.change(screen.getByLabelText('Fenster 1 Monteur'), { target: { value: 's-1' } })
    mockFetch.mockResolvedValueOnce(ansicht({ anfragen: [OFFEN] }))
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    await screen.findByText('Die Mail ist beim Kunden.')
    const [pfad, opts] = mockFetch.mock.calls[1]
    expect(pfad).toBe('/pwa/admin/projects/p-1/terminwahl')
    expect(JSON.parse(String((opts as RequestInit).body)).fenster).toEqual([
      { datum: '2026-11-19', start: '08:00', ende: '10:00', monteur_ids: ['s-1'] }])
  })

  it('belegt die Dauer aus der Vorgabe der Termin-Art vor und schickt Art und Dauer mit', async () => {
    mockFetch.mockResolvedValueOnce(ansicht({ dauer_vorgaben: {
      reparatur: { von: 60, bis: 120 }, service: { von: 45, bis: 45 } } }))
    render(<TerminwahlKachel projectId="p-1" staff={STAFF} terminwahl kindVorschlag="reparatur" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dem Kunden zur Wahl senden' }))
    expect(screen.getByLabelText('Dauer von')).toHaveValue('60')
    expect(screen.getByLabelText('bis')).toHaveValue('120')
    // Andere Art → deren Vorgabe; «von» länger als «bis» sperrt das Senden.
    fireEvent.change(screen.getByLabelText('Termin-Art'), { target: { value: 'service' } })
    expect(screen.getByLabelText('Dauer von')).toHaveValue('45')
    fireEvent.change(screen.getByLabelText('Dauer von'), { target: { value: '90' } })
    expect(screen.getByText('«Dauer von» ist länger als «bis».')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('bis'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fenster 2 entfernen' }))
    fireEvent.change(screen.getByLabelText('Fenster 1 Datum'), { target: { value: '2026-11-19' } })
    fireEvent.change(screen.getByLabelText('Fenster 1 Monteur'), { target: { value: 's-1' } })
    mockFetch.mockResolvedValueOnce(ansicht({ anfragen: [OFFEN] }))
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    await screen.findByText('Die Mail ist beim Kunden.')
    const body = JSON.parse(String((mockFetch.mock.calls[1][1] as RequestInit).body))
    expect([body.kind, body.dauer_von, body.dauer_bis]).toEqual(['service', 90, 120])
  })

  it('zeigt eine offene Anfrage mit Fenstern und Frist, zurückziehen statt senden', async () => {
    mockFetch.mockResolvedValueOnce(ansicht({ anfragen: [OFFEN] }))
    render(<TerminwahlKachel projectId="p-1" staff={STAFF} terminwahl />)
    expect(await screen.findByText('Offen — wartet auf die Wahl des Kunden')).toBeInTheDocument()
    expect(screen.getByText('Donnerstag, 19. November, 08:00–10:00 Uhr')).toBeInTheDocument()
    expect(screen.getByTestId('terminwahl-stand')).toHaveTextContent('Dauer etwa 1 bis 2 Stunden')
    expect(screen.queryByRole('button', { name: 'Dem Kunden zur Wahl senden' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anfrage zurückziehen' })).toBeInTheDocument()
  })

  it('nur Statusseite: Kundenlink kopieren und sperren, keine Terminwahl', async () => {
    mockFetch.mockResolvedValueOnce({ url: 'https://api.example.ch/auftrag/abc' })
    render(<TerminwahlKachel projectId="p-1" staff={STAFF} terminwahl={false} />)
    expect(await screen.findByRole('button', { name: 'Kundenlink kopieren' })).toBeInTheDocument()
    expect(mockFetch.mock.calls[0][0]).toBe('/pwa/admin/projects/p-1/kundenlink')
    expect(screen.queryByRole('button', { name: 'Dem Kunden zur Wahl senden' })).toBeNull()
    mockFetch.mockResolvedValueOnce({ url: 'https://api.example.ch/auftrag/neu' })
    fireEvent.click(screen.getByRole('button', { name: 'Link sperren' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sperren' }))
    await waitFor(() => expect(mockFetch.mock.calls[1][0]).toBe('/pwa/admin/projects/p-1/kundenlink/sperren'))
    expect(await screen.findByText(/Frühere Links gelten nicht mehr/)).toBeInTheDocument()
  })
})
