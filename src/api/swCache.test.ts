import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./client', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from './client'
import { clearApiCache } from './swCache'
import { logout } from './auth'

// Der Workbox-Cache 'api-cache' (vite.config.ts) hängt am Gerät, nicht an der
// Session. Diese Tests pinnen, dass er beim Logout geleert wird — sonst bekäme
// auf einem geteilten Gerät der nächste Nutzer offline die gecachten Antworten
// des Vorgängers serviert (inkl. /pwa/me → fremde Identität/Lohndaten).

const deleteMock = vi.fn()

function installCachesStub() {
  Object.defineProperty(window, 'caches', {
    value: { delete: deleteMock },
    configurable: true,
  })
}

function removeCachesStub() {
  // jsdom hat keine Cache-API — Property wieder entfernen
  delete (window as unknown as Record<string, unknown>).caches
}

beforeEach(() => {
  vi.clearAllMocks()
  deleteMock.mockResolvedValue(true)
  installCachesStub()
})

afterEach(() => removeCachesStub())

describe('clearApiCache', () => {
  it('löscht genau den Workbox-Cache api-cache', async () => {
    await clearApiCache()
    expect(deleteMock).toHaveBeenCalledWith('api-cache')
  })

  it('wirft nicht, wenn die Cache-API fehlt (z.B. Private Mode)', async () => {
    removeCachesStub()
    await expect(clearApiCache()).resolves.toBeUndefined()
  })

  it('schluckt Fehler der Cache-API (best-effort)', async () => {
    deleteMock.mockRejectedValue(new Error('kaputt'))
    await expect(clearApiCache()).resolves.toBeUndefined()
  })
})

describe('logout', () => {
  it('leert den API-Cache nach erfolgreichem Server-Logout', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined)
    await logout()
    expect(apiFetch).toHaveBeenCalledWith('/pwa/auth/logout', { method: 'POST' })
    expect(deleteMock).toHaveBeenCalledWith('api-cache')
  })

  it('leert den API-Cache auch, wenn der Server-Logout fehlschlägt (offline)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'))
    await expect(logout()).rejects.toThrow('offline')
    expect(deleteMock).toHaveBeenCalledWith('api-cache')
  })
})
