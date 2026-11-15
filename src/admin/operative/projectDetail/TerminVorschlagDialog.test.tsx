import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminVorschlagDialog, tagKurz } from './TerminVorschlagDialog'
import { apiFetch } from '../../../api/client'
import type { TerminVorschlaegeAntwort } from '../../../api/serviceBegleitung'

// Dialog «Termin vorschlagen» (docs/specs/servicebegleitung.md §6.6, §13).

vi.mock('../../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)

const STAFF = [{ id: 's-1', name: 'Marco Keller' }, { id: 's-2', name: 'Nicole Baumann' }]

function antwort(over: Partial<TerminVorschlaegeAntwort> = {}): TerminVorschlaegeAntwort {
  return {
    vorschlaege: [
      { staff_id: 's-2', name: 'Nicole Baumann', datum: '2026-11-19', start: '08:00', ende: '10:00', score: 84,
        gruende: ['12 Min. Umweg zwischen Lindenweg und Bahnhofplatz', 'war am 03.09.2026 an dieser Anlage'] },
      { staff_id: 's-1', name: 'Marco Keller', datum: '2026-11-20', start: '13:00', ende: '15:00', score: 71,
        gruende: ['übermorgen'] },
    ],
    ausgeschlossen: [{ staff_id: 's-3', name: 'David Schmid', grund: 'Skill Wärmepumpe fehlt' }],
    hinweise: [], grund: '', kind: 'service', dauer_min: 90, horizont: 10, bis: '2026-11-30', ...over,
  }
}

beforeEach(() => mockFetch.mockReset())

describe('TerminVorschlagDialog', () => {
  it('zeigt Vorschläge mit Begründung und die Ausgeschlossenen', async () => {
    mockFetch.mockResolvedValueOnce(antwort())
    render(<TerminVorschlagDialog projectId="p-1" staff={STAFF} kindVorschlag="service" terminwahl={false}
                                  onUebernehmen={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('Do 19.11. · 08:00–10:00 · Nicole Baumann')).toBeInTheDocument()
    expect(screen.getByText('war am 03.09.2026 an dieser Anlage')).toBeInTheDocument()
    expect(screen.getByText('David Schmid: Skill Wärmepumpe fehlt')).toBeInTheDocument()
    const [pfad, opts] = mockFetch.mock.calls[0]
    expect(pfad).toBe('/pwa/admin/projects/p-1/terminvorschlaege')
    expect(JSON.parse(String((opts as RequestInit).body)).kind).toBe('service')
    // Die Dauer, mit der gerechnet wurde, steht danach im Feld.
    expect(screen.getByLabelText('Dauer')).toHaveValue('90')
  })

  it('«Übernehmen» gibt den Vorschlag weiter und protokolliert den Rang', async () => {
    mockFetch.mockResolvedValueOnce(antwort()).mockResolvedValueOnce({ status: 'success' })
    const uebernehmen = vi.fn()
    render(<TerminVorschlagDialog projectId="p-1" staff={STAFF} kindVorschlag="reparatur" terminwahl={false}
                                  onUebernehmen={uebernehmen} onClose={vi.fn()} />)
    const knoepfe = await screen.findAllByRole('button', { name: 'Übernehmen' })
    fireEvent.click(knoepfe[1])
    expect(uebernehmen).toHaveBeenCalledWith(expect.objectContaining({ staff_id: 's-1', datum: '2026-11-20' }), 'reparatur')
    await waitFor(() => expect(mockFetch.mock.calls[1][0]).toBe('/pwa/admin/projects/p-1/terminvorschlaege/protokoll'))
    expect(JSON.parse(String((mockFetch.mock.calls[1][1] as RequestInit).body))).toEqual({ ergebnis: 'rang_2' })
  })

  it('ohne Vorschlag: Grund und «Horizont verdoppeln»', async () => {
    mockFetch.mockResolvedValueOnce(antwort({ vorschlaege: [], grund: 'In den nächsten 10 Arbeitstagen ist keine passende Lücke frei.' }))
    render(<TerminVorschlagDialog projectId="p-1" staff={STAFF} kindVorschlag="service" terminwahl={false}
                                  onUebernehmen={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText(/keine passende Lücke frei/)).toBeInTheDocument()
    mockFetch.mockResolvedValueOnce(antwort({ horizont: 20 }))
    fireEvent.click(screen.getByRole('button', { name: 'Horizont verdoppeln' }))
    await screen.findByText('Do 19.11. · 08:00–10:00 · Nicole Baumann')
    expect(JSON.parse(String((mockFetch.mock.calls[1][1] as RequestInit).body)).horizont).toBe(20)
  })

  it('übergibt die angehakten Vorschläge an die Terminwahl', async () => {
    mockFetch.mockResolvedValueOnce(antwort()).mockResolvedValueOnce({
      anfragen: [], vorgabe_reserviert_bis: '2026-11-18T12:00', empfaenger_vorschlag: 'kunde@example.ch',
      kundenlink: null, dauer_vorgaben: {},
    })
    render(<TerminVorschlagDialog projectId="p-1" staff={STAFF} kindVorschlag="service" terminwahl
                                  onUebernehmen={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Vorschlag 2 zur Wahl'))   // nur den ersten behalten
    fireEvent.click(screen.getByRole('button', { name: 'Dem Kunden zur Wahl senden (1)' }))
    expect(await screen.findByRole('dialog', { name: 'Dem Kunden zur Wahl senden' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fenster 1 Datum')).toHaveValue('2026-11-19')
    expect(screen.getByLabelText('Fenster 1 Monteur')).toHaveValue('s-2')
    expect(screen.queryByLabelText('Fenster 2 Datum')).toBeNull()
    expect(screen.getByLabelText('Dauer von')).toHaveValue('90')
  })

  it('tagKurz', () => {
    expect(tagKurz('2026-11-19')).toBe('Do 19.11.')
  })
})
