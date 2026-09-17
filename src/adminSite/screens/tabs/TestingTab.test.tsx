import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TestingTab } from './TestingTab'

// docs/specs/beta-tester.md — der Tab ist die Voraussetzung für alles andere.

const listUsers = vi.fn()
const saveUser = vi.fn()
const getTenantFeatures = vi.fn()
const getTenantModules = vi.fn()

vi.mock('../../../api/admin/users', () => ({
  listUsers: () => listUsers(),
  saveUser: (...a: unknown[]) => saveUser(...a),
}))
vi.mock('../../../api/admin', () => ({
  getTenantFeatures: () => getTenantFeatures(),
  getTenantModules: () => getTenantModules(),
}))

const konto = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'a@b.ch', display_name: 'Anna Muster', role: 'user',
  is_active: true, created_at: '', consent_version: 'v6', consent_current: true,
  username: 'am', beta_tester: false, ...over,
})

beforeEach(() => {
  listUsers.mockReset().mockResolvedValue([konto()])
  saveUser.mockReset().mockResolvedValue(undefined)
  getTenantFeatures.mockReset().mockResolvedValue({ registry: [], effective: {} })
  getTenantModules.mockReset().mockResolvedValue({ beta_modules: [] })
})

describe('TestingTab', () => {
  it('sagt, dass das Häkchen wirkungslos ist, solange nichts in der Beta ist', async () => {
    render(<TestingTab />)
    expect(await screen.findByText(/Zurzeit nichts/)).toBeTruthy()
  })

  it('führt auf, was gerade im Betatest ist — Module und Features', async () => {
    getTenantModules.mockResolvedValue({ beta_modules: ['quotes'] })
    getTenantFeatures.mockResolvedValue({
      registry: [{ key: 'probe', label: 'Sonderpositionen', stage: 'beta' }],
      effective: { probe: { enabled: true } },
    })
    render(<TestingTab />)
    expect(await screen.findByText('quotes')).toBeTruthy()
    expect(screen.getByText('Sonderpositionen')).toBeTruthy()
  })

  it('zeigt ein Beta-Feature nicht an, das beim Mandanten gar nicht an ist', async () => {
    // Sonst sucht man den Tester-Fehler, obwohl der Mandanten-Schalter fehlt.
    getTenantFeatures.mockResolvedValue({
      registry: [{ key: 'probe', label: 'Sonderpositionen', stage: 'beta' }],
      effective: { probe: { enabled: false } },
    })
    render(<TestingTab />)
    expect(await screen.findByText(/Zurzeit nichts/)).toBeTruthy()
  })

  it('setzt das Häkchen sofort und meldet den Stand zurück', async () => {
    render(<TestingTab />)
    const box = await screen.findByRole('checkbox')
    fireEvent.click(box)
    await waitFor(() => expect(saveUser).toHaveBeenCalledTimes(1))
    expect(saveUser.mock.calls[0][0]).toMatchObject({ beta_tester: true })
    expect(saveUser.mock.calls[0][1]).toBe('u1')
    expect(await screen.findByText(/1 von 1 Konten testen mit/)).toBeTruthy()
  })

  it('lässt die Liste stehen, wenn nur der Beta-Überblick scheitert', async () => {
    // Die Tester-Liste ist der Zweck des Tabs; der Überblick ist Beiwerk.
    getTenantModules.mockRejectedValue(new Error('kaputt'))
    getTenantFeatures.mockRejectedValue(new Error('kaputt'))
    render(<TestingTab />)
    expect(await screen.findByText('Anna Muster')).toBeTruthy()
  })
})
