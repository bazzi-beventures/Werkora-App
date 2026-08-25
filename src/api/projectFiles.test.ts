import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  deleteProjectFile, listProjectFiles, projectFileUrl, renameProjectFile, uploadProjectFile,
} from './projectFiles'
import { apiFetch, apiFormFetch } from './client'

// Monteur-PWA und Verwaltung sprechen dieselben Endpoints mit verschiedenem
// Präfix (Charge H5). Der Test hält fest, dass aus dem Scope wirklich der Pfad
// wird — vorher standen beide Familien getrennt im jeweiligen Screen, und nur
// eine davon wurde gepflegt.

vi.mock('./client', () => ({
  apiFetch: vi.fn(async () => []),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => `https://api.example${p}`,
}))

const fetchMock = vi.mocked(apiFetch)
const formMock = vi.mocked(apiFormFetch)

beforeEach(() => { fetchMock.mockClear(); formMock.mockClear() })

describe('Datei-Endpoints je Sicht', () => {
  it.each([
    ['/pwa' as const, '/pwa/projects/p1/files'],
    ['/pwa/admin' as const, '/pwa/admin/projects/p1/files'],
  ])('Liste unter %s', async (scope, path) => {
    await listProjectFiles(scope, 'p1')
    expect(fetchMock).toHaveBeenCalledWith(path)
  })

  it('Upload schickt Datei und Kategorie als Formular', async () => {
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' })
    await uploadProjectFile('/pwa', 'p1', file, 'masse')
    const [path, form] = formMock.mock.calls[0] as [string, FormData]
    expect(path).toBe('/pwa/projects/p1/files')
    expect(form.get('category')).toBe('masse')
    expect((form.get('file') as File).name).toBe('plan.pdf')
  })

  it('Umbenennen und Löschen treffen dieselbe Datei-URL', async () => {
    await renameProjectFile('/pwa/admin', 'p1', 'f9', 'Neuer Name.pdf')
    expect(fetchMock).toHaveBeenCalledWith('/pwa/admin/projects/p1/files/f9', {
      method: 'PATCH', body: JSON.stringify({ filename: 'Neuer Name.pdf' }),
    })
    await deleteProjectFile('/pwa', 'p1', 'f9')
    expect(fetchMock).toHaveBeenLastCalledWith('/pwa/projects/p1/files/f9', { method: 'DELETE' })
  })

  it('Download-Link: ohne Flag öffnen, mit Flag speichern', () => {
    expect(projectFileUrl('/pwa', 'p1', 'f9'))
      .toBe('https://api.example/pwa/projects/p1/files/f9/download')
    expect(projectFileUrl('/pwa/admin', 'p1', 'f9', { download: true }))
      .toBe('https://api.example/pwa/admin/projects/p1/files/f9/download?download=1')
  })
})
