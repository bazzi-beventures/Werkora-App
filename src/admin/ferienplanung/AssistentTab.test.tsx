import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiFetch, apiStreamFetch } from '../../api/client'
import { queryClient } from '../../shared/queryClient'
import { AssistentTab } from './AssistentTab'
import { RegelnTab } from './RegelnTab'

// Ferien-Assistent (docs/specs/ferienplanung.md §11): Chat mit Themen-Stand; was er
// anlegt, ist ein Vorschlag, der erst mit «Übernehmen» wirkt.

vi.mock('../../api/client', () => ({ apiFetch: vi.fn(), apiStreamFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)
const mockStream = vi.mocked(apiStreamFetch)

const STAND = {
  themen: [
    { thema: 'kanton_feiertage', titel: 'Kanton und Feiertage', frage: '…', status: 'erledigt', notiz: '' },
    { thema: 'betriebsferien', titel: 'Betriebsferien', frage: '…', status: 'offen', notiz: '' },
  ],
  vorschlaege: 2,
}

beforeEach(() => {
  queryClient.clear()
  mockFetch.mockReset().mockResolvedValue(STAND)
  mockStream.mockReset()
})

describe('AssistentTab', () => {
  it('zeigt Themen-Stand und offene Vorschläge', async () => {
    render(<AssistentTab />)
    expect(await screen.findByText(/Kanton und Feiertage/)).toBeTruthy()
    expect(screen.getByText('2 Vorschläge warten in den Reitern auf «Übernehmen».')).toBeTruthy()
  })

  it('streamt die Antwort und zeigt den Werkzeug-Schritt', async () => {
    mockStream.mockImplementation(async function* () {
      yield { type: 'tool', label: 'Lese den Stand …' }
      yield { type: 'delta', text: 'Machen Sie über ' }
      yield { type: 'delta', text: 'Weihnachten zu?' }
      yield { type: 'done' }
    })
    render(<AssistentTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Gespräch starten' }))
    expect(await screen.findByText('Machen Sie über Weihnachten zu?')).toBeTruthy()
    expect(mockStream).toHaveBeenCalledWith('/pwa/admin/ferienplanung/assistent/frage',
      expect.objectContaining({ history: [] }))
    fireEvent.change(screen.getByLabelText('Nachricht an den Assistenten'), { target: { value: 'Ja, 24.12. bis 2.1.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2))
    expect(mockStream.mock.calls[1][1]).toMatchObject({ question: 'Ja, 24.12. bis 2.1.', history: [
      { role: 'user' }, { role: 'assistant', text: 'Machen Sie über Weihnachten zu?' }] })
  })
})

describe('Vorschlag übernehmen', () => {
  it('setzt den Status auf aktiv', async () => {
    const daten = {
      gruppen: [], sperrfristen: [], personen: [{ id: 'a', name: 'Anna', funktion: null }, { id: 'b', name: 'Beat', funktion: null }],
      funktionen: [], vorlagen: [],
      regeln: [{ id: 'r1', titel: 'Anna nicht mit Beat', art: 'gleichzeitig', gruppe_id: null, staff_ids: ['a', 'b'],
        parameter: { max_abwesend: 1 }, haerte: 'hart', gueltig_ab: null, gueltig_bis: null, status: 'vorschlag', quelle: 'assistent' }],
    }
    mockFetch.mockResolvedValue({ status: 'success' })
    render(<RegelnTab daten={daten} darfPflegen />)
    expect(screen.getByText('Vorschlag des Assistenten')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/ferienplanung/regeln/r1', {
      method: 'PATCH', body: JSON.stringify({ daten: { status: 'aktiv' } }),
    }))
  })
})
