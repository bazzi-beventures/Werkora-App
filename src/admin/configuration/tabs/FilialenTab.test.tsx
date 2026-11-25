import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FilialenTab } from './FilialenTab'
import { apiFetch } from '../../../api/client'
import { queryClient } from '../../../shared/queryClient'

// Einstellungen → Filialen (docs/specs/ferienplanung.md §10.3): Filialen in anderen
// Kantonen, gepflegt von der Geschäftsleitung.

vi.mock('../../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)

const LISTE = {
  filialen: [{ id: 'f-1', name: 'Lugano', kanton: 'TI', aktiv: true }],
  hauptsitz_kanton: 'ZH',
  kantone: ['GE', 'TI', 'ZH'],
}

beforeEach(() => {
  mockFetch.mockReset()
  queryClient.clear()
})

describe('FilialenTab', () => {
  it('zeigt Filialen und den Kanton des Hauptsitzes', async () => {
    mockFetch.mockResolvedValue(LISTE)
    render(<FilialenTab />)
    expect(await screen.findByText('Lugano')).toBeInTheDocument()
    expect(screen.getByLabelText('Kanton von Lugano')).toHaveValue('TI')
    expect(screen.getByText('ZH', { selector: 'strong' })).toBeInTheDocument()
  })

  it('legt eine Filiale an und liest neu', async () => {
    mockFetch.mockResolvedValue(LISTE)
    render(<FilialenTab />)
    const anlegen = await screen.findByRole('button', { name: 'Filiale anlegen' })
    expect(anlegen).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Name der neuen Filiale'), { target: { value: ' Genf ' } })
    fireEvent.change(screen.getByLabelText('Kanton der neuen Filiale'), { target: { value: 'GE' } })
    mockFetch.mockResolvedValueOnce({ status: 'success', filiale: { id: 'f-2', name: 'Genf', kanton: 'GE', aktiv: true } })
    fireEvent.click(anlegen)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/filialen', expect.objectContaining({ method: 'POST' })))
    const post = mockFetch.mock.calls.find(([, o]) => (o as RequestInit | undefined)?.method === 'POST')!
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ name: 'Genf', kanton: 'GE' })
    await waitFor(() => expect(mockFetch.mock.calls.filter(([p, o]) => p === '/pwa/admin/filialen' && !o)).toHaveLength(2))
  })

  it('schaltet eine Filiale inaktiv', async () => {
    mockFetch.mockResolvedValue(LISTE)
    render(<FilialenTab />)
    fireEvent.click(await screen.findByRole('checkbox'))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/pwa/admin/filialen/f-1', { method: 'PATCH', body: JSON.stringify({ aktiv: false }) }))
  })
})
