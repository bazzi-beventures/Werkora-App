/**
 * Der Mandanten-Wähler (docs/specs/admin-werkora-ch.md §4.2).
 *
 * Geprüft wird die Rangfolge Hash → localStorage → keiner, und dass
 * `requireTenantId` ohne Auswahl **wirft** statt still weiterzulaufen. Das ist
 * die Zusicherung hinter §12: eine schreibende Aktion ohne Mandanten darf nicht
 * irgendwo landen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const listTenants = vi.fn()
vi.mock('../api/platform', () => ({ listTenants: () => listTenants() }))

import { useTenantScope } from './useTenantScope'
import { SK } from '../api/storageKeys'

const GEHLHAAR = { id: 't-1', slug: 'gehlhaar', name: 'Gehlhaar AG', enabled_modules: [], beta_modules: [] }
const STAEHLI = { id: 't-2', slug: 'staehli', name: 'Stähli GmbH', enabled_modules: [], beta_modules: [] }

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  listTenants.mockReset().mockResolvedValue([GEHLHAAR, STAEHLI])
})

describe('useTenantScope', () => {
  it('ohne Hash und ohne Speicher ist kein Mandant gewählt', async () => {
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tenantId).toBeNull()
    expect(result.current.tenant).toBeNull()
    expect(result.current.tenants).toHaveLength(2)
  })

  it('ein einziger Mandant wird NICHT vorausgewählt', async () => {
    // Vorauswahl wäre bequem und der Anfang der Verwechslung: «eine Zeile in der
    // Liste» heisst nicht «diese ist gemeint».
    listTenants.mockResolvedValue([GEHLHAAR])
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tenantId).toBeNull()
  })

  it('der Hash gewinnt über den Speicher', async () => {
    localStorage.setItem(SK.ADMIN_TENANT_ID, 't-2')
    window.location.hash = '#/t/gehlhaar/konfiguration'
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tenantId).toBe('t-1')
  })

  it('ohne Hash greift der Speicher', async () => {
    localStorage.setItem(SK.ADMIN_TENANT_ID, 't-2')
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tenantId).toBe('t-2')
  })

  it('ein Mandant, den es nicht mehr gibt, fällt still heraus', async () => {
    // Etwa nach einem Umgebungswechsel: die id steht noch im Speicher, der
    // Server kennt sie nicht. Ein Wähler, der darauf zeigt, bekäme 404.
    localStorage.setItem(SK.ADMIN_TENANT_ID, 't-weg')
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tenantId).toBeNull()
  })

  it('selectTenant schreibt Speicher und Hash', async () => {
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.selectTenant('t-2'))

    expect(result.current.tenantId).toBe('t-2')
    expect(localStorage.getItem(SK.ADMIN_TENANT_ID)).toBe('t-2')
    expect(window.location.hash).toContain('/t/staehli/')
  })

  it('selectTenant(null) räumt beides wieder ab', async () => {
    localStorage.setItem(SK.ADMIN_TENANT_ID, 't-1')
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.selectTenant(null))

    expect(result.current.tenantId).toBeNull()
    expect(localStorage.getItem(SK.ADMIN_TENANT_ID)).toBeNull()
    expect(window.location.hash).not.toContain('/t/')
  })

  it('der Speicher wird in die Adresse nachgezogen', async () => {
    // Sonst kippt der nächste Screenwechsel den Mandanten aus dem Hash — und
    // der hashchange-Abgleich unten liesse ihn dann fallen.
    localStorage.setItem(SK.ADMIN_TENANT_ID, 't-2')
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(window.location.hash).toContain('/t/staehli/')
  })

  it('Zurück im Browser zieht den Wähler mit', async () => {
    // Das Fehlerbild ohne diesen Abgleich: Adresse sagt Gehlhaar, Kopfzeile
    // sagt Stähli, geschrieben wird bei Stähli.
    window.location.hash = '#/t/staehli/konfiguration'
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.tenantId).toBe('t-2'))

    act(() => { window.location.hash = '#/t/gehlhaar/konfiguration' })

    await waitFor(() => expect(result.current.tenantId).toBe('t-1'))
    expect(result.current.tenant?.slug).toBe('gehlhaar')
    expect(localStorage.getItem(SK.ADMIN_TENANT_ID)).toBe('t-1')
  })

  it('ein Hash ohne Mandanten räumt die Auswahl ab', async () => {
    window.location.hash = '#/t/gehlhaar/konfiguration'
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.tenantId).toBe('t-1'))

    act(() => { window.location.hash = '#/uebersicht' })

    await waitFor(() => expect(result.current.tenantId).toBeNull())
  })

  it('ein unbekannter Slug lässt nicht den alten Mandanten stehen', async () => {
    window.location.hash = '#/t/gehlhaar/konfiguration'
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.tenantId).toBe('t-1'))

    act(() => { window.location.hash = '#/t/gibtsnicht/konfiguration' })

    await waitFor(() => expect(result.current.tenantId).toBeNull())
  })

  it('requireTenantId wirft, solange keiner gewählt ist', async () => {
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(() => result.current.requireTenantId()).toThrow()
  })

  it('requireTenantId liefert den gewählten Mandanten', async () => {
    localStorage.setItem(SK.ADMIN_TENANT_ID, 't-1')
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.requireTenantId()).toBe('t-1')
  })

  it('ein Ladefehler kippt die Seite nicht, sondern meldet sich', async () => {
    listTenants.mockRejectedValue(new Error('kaputt'))
    const { result } = renderHook(() => useTenantScope())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('kaputt')
    expect(result.current.tenants).toEqual([])
  })
})
