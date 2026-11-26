import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiFetch } from '../../api/client'
import { queryClient } from '../../shared/queryClient'
import { KontenTab } from './KontenTab'

// Ferienkonten (docs/specs/ferienplanung.md §5, §9 — E7): Übertrag und Hinweise
// anzeigen, Korrektur von Hand, Krankheit in den Ferien erst auf Knopfdruck.

vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }))
const mockFetch = vi.mocked(apiFetch)
const JAHR = new Date().getFullYear()

const KONTO = {
  staff_id: 'a', name: 'Anna', anspruch: 25, quelle: 'unter_20', uebertrag: 3.5, korrektur: 0, bezogen: 5,
  geplant: 10, rest: 13.5, notiz: '', abgeschlossen: false, abgeschlossen_am: null, herkunft: { [JAHR - 1]: 3.5 },
  herkunft_ende: { [JAHR]: 13.5 },
  hinweise: [{ code: 'P8', text: 'Krankmeldung während der Ferien: 3 Arbeitstage.', gesetz: 'OR 329a (Rechtsprechung)',
    tage: 3, absence_id: 'f1' }],
}

beforeEach(() => {
  queryClient.clear()
  mockFetch.mockReset().mockImplementation(async (pfad: string) => {
    if (pfad.startsWith('/pwa/admin/ferienplanung/konten?')) {
      return { jahr: JAHR, konten: [KONTO], darf_bearbeiten: true, darf_abschliessen: true }
    }
    return { status: 'success', tage: 3, vorher: { date_start: '', date_end: '' }, stuecke: [] }
  })
})

describe('KontenTab', () => {
  it('zeigt Übertrag, Rest und Hinweis', async () => {
    render(<KontenTab />)
    const zeile = await screen.findByTestId('ferien-konto')
    expect(zeile).toHaveTextContent('Anna')
    expect(zeile).toHaveTextContent('3.5 d')
    expect(zeile).toHaveTextContent('13.5 d')
    expect(zeile).toHaveTextContent('Krankmeldung während der Ferien')
  })

  it('kürzt die Ferien erst auf Knopfdruck', async () => {
    render(<KontenTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ferien um 3 Tage kürzen' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/ferienplanung/konten/kuerzen', {
      method: 'POST', body: JSON.stringify({ absence_id: 'f1' }),
    }))
  })

  it('speichert eine Korrektur', async () => {
    render(<KontenTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Korrektur'), { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(`/pwa/admin/ferienplanung/konten/a/${JAHR}`, {
      method: 'PUT', body: JSON.stringify({ uebertrag_tage: 3.5, korrektur_tage: -2, notiz: '' }),
    }))
  })

  it('Jahresabschluss erst nach Bestätigung', async () => {
    render(<KontenTab />)
    fireEvent.click(await screen.findByRole('button', { name: `Jahresabschluss ${JAHR}` }))
    expect(mockFetch).not.toHaveBeenCalledWith('/pwa/admin/ferienplanung/konten/abschluss', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Abschliessen' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/ferienplanung/konten/abschluss', {
      method: 'POST', body: JSON.stringify({ jahr: JAHR }),
    }))
  })
})
