// Personalordner (WW-106, docs/specs/personalordner.md): Register, Hochladen,
// Löschen — und dass das Büro (Rolle admin) den Ordner gar nicht erst sieht.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Personalordner from './Personalordner'
import StaffDetailScreen from './StaffDetailScreen'
import { apiFetch, apiFormFetch } from '../../api/client'
import { queryClient } from '../../shared/queryClient'
import type { StaffMember } from '../../api/admin'

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))

const mockFetch = vi.mocked(apiFetch)
const mockForm = vi.mocked(apiFormFetch)

const DATEIEN = [
  { id: 'f-1', staff_id: 's-1', category: 'vertrag', filename: 'Arbeitsvertrag.pdf', mime_type: 'application/pdf', size_bytes: 120_000, created_at: '2026-11-20T09:00:00Z' },
  { id: 'f-2', staff_id: 's-1', category: 'gespraech', filename: 'MA-Gespräch 2026.pdf', mime_type: 'application/pdf', size_bytes: 80_000, created_at: '2026-11-21T09:00:00Z' },
]

function route(dateien = DATEIEN) {
  mockFetch.mockImplementation(async (path: string) => {
    if (path === '/pwa/admin/staff/s-1/files') return { dateien }
    return [] as never
  })
}

afterEach(() => { queryClient.clear(); mockFetch.mockReset(); mockForm.mockReset() })

describe('Personalordner', () => {
  it('zeigt die vier Register mit Anzahl und je Register nur dessen Dateien', async () => {
    route()
    render(<Personalordner staffId="s-1" />)
    expect(await screen.findByText('MA-Gespräch 2026.pdf')).toBeTruthy()
    expect(screen.queryByText('Arbeitsvertrag.pdf')).toBeNull()
    for (const name of ['MA-Gespräche (1)', 'Vertrag/Unterschriften (1)', 'Versicherungen', 'Zertifikate']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    await userEvent.click(screen.getByRole('button', { name: 'Vertrag/Unterschriften (1)' }))
    const link = screen.getByRole('link', { name: 'Arbeitsvertrag.pdf' })
    // Download über den Backend-Proxy, nie über eine signierte Bucket-URL.
    expect(link.getAttribute('href')).toBe('/pwa/admin/staff/s-1/files/f-1/download')
  })

  it('lädt ins gewählte Register hoch', async () => {
    route([])
    mockForm.mockResolvedValue(DATEIEN[0] as never)
    render(<Personalordner staffId="s-1" />)
    await screen.findByText('In diesem Register liegt noch nichts.')
    await userEvent.click(screen.getByRole('button', { name: 'Zertifikate' }))
    const datei = new File(['%PDF'], 'SUVA.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Datei für den Personalordner'), datei)

    await waitFor(() => expect(mockForm).toHaveBeenCalledTimes(1))
    const [pfad, form] = mockForm.mock.calls[0]
    expect(pfad).toBe('/pwa/admin/staff/s-1/files')
    expect((form as FormData).get('category')).toBe('zertifikat')
    expect(((form as FormData).get('file') as File).name).toBe('SUVA.pdf')
  })

  it('löscht erst nach Bestätigung', async () => {
    route()
    render(<Personalordner staffId="s-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'MA-Gespräch 2026.pdf löschen' }))
    expect(mockFetch).not.toHaveBeenCalledWith('/pwa/admin/staff/s-1/files/f-2', { method: 'DELETE' })
    const dialog = screen.getByText('Datei löschen?').closest('div')!.parentElement as HTMLElement
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/staff/s-1/files/f-2', { method: 'DELETE' }))
  })
})

describe('Personalordner im Mitarbeiter-Formular', () => {
  const member = {
    id: 's-1', name: 'Daniel Marty', kuerzel: 'DM', funktion: 'Monteur', rapportpflicht: true,
    projektleiter: false, pensum: 80,
  } as unknown as StaffMember

  function formular(actingRole: string, personalordner = true) {
    route()
    render(<StaffDetailScreen member={member} actingRole={actingRole} personalordner={personalordner}
      onClose={vi.fn()} onSaved={vi.fn()} />)
  }

  it.each(['management', 'management_light'])('erscheint für %s', async rolle => {
    formular(rolle)
    expect(await screen.findByRole('region', { name: 'Personalordner' })).toBeTruthy()
  })

  it('bleibt für das Büro (admin) verborgen und lädt nichts', () => {
    formular('admin')
    expect(screen.queryByRole('region', { name: 'Personalordner' })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalledWith('/pwa/admin/staff/s-1/files')
  })

  it('bleibt verborgen, solange der Betrieb das Feature nicht eingeschaltet hat', () => {
    formular('management', false)
    expect(screen.queryByRole('region', { name: 'Personalordner' })).toBeNull()
  })
})
