import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminDauerTab } from './TerminDauerTab'
import { apiFetch } from '../../../api/client'

// Einstellungen → Termindauer (docs/specs/servicebegleitung.md Entscheid 9): Vorgaben je
// Termin-Art, gepflegt vom Management des Betriebs.

vi.mock('../../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)

const ARTEN = [{ key: 'service', label: 'Service' }, { key: 'reparatur', label: 'Reparatur' }]

beforeEach(() => mockFetch.mockReset())

describe('TerminDauerTab', () => {
  it('zeigt die Vorgaben und speichert eine neue Art, leere Arten als «keine Angabe»', async () => {
    mockFetch.mockResolvedValueOnce({ vorgaben: { service: { von: 60, bis: 120 } }, arten: ARTEN })
    render(<TerminDauerTab />)
    expect(await screen.findByLabelText('Service von')).toHaveValue('60')
    expect(screen.getByLabelText('Reparatur von')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reparatur von'), { target: { value: '90' } })
    mockFetch.mockResolvedValueOnce({ vorgaben: { service: { von: 60, bis: 120 }, reparatur: { von: 90, bis: 90 } },
                                     arten: ARTEN })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    const [pfad, opts] = mockFetch.mock.calls[1]
    expect(pfad).toBe('/pwa/admin/service/termindauer')
    expect(JSON.parse(String((opts as RequestInit).body)).vorgaben).toEqual({
      service: { von: 60, bis: 120 }, reparatur: { von: 90, bis: 90 } })
  })

  it('sperrt das Speichern, wenn «von» länger ist als «bis»', async () => {
    mockFetch.mockResolvedValueOnce({ vorgaben: { service: { von: 60, bis: 120 } }, arten: ARTEN })
    render(<TerminDauerTab />)
    fireEvent.change(await screen.findByLabelText('Service von'), { target: { value: '180' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Service')
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })
})
