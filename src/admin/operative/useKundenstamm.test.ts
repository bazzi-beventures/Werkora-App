import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveCustomer, type Customer } from '../../api/admin/customers'
import { queryClient } from '../../shared/queryClient'
import { ladeKundenstamm } from './useKundenstamm'

const apiFetch = vi.fn()
vi.mock('../../api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const kunde = (id: string, name: string) => ({ id, name }) as Customer

afterEach(() => { queryClient.clear(); apiFetch.mockReset() })

describe('ladeKundenstamm', () => {
  it('holt den Stamm einmal — Einsatzplanung, «Projekt anlegen» und Projektmaske teilen ihn', async () => {
    apiFetch.mockResolvedValue([kunde('c1', 'Muster')])
    expect(await ladeKundenstamm()).toEqual([kunde('c1', 'Muster')])
    expect(await ladeKundenstamm()).toEqual([kunde('c1', 'Muster')])
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/pwa/admin/customers')
  })

  it('ein eben angelegter Kunde ist ohne neuen Abruf dabei', async () => {
    apiFetch.mockResolvedValueOnce([kunde('c1', 'Muster')])
    await ladeKundenstamm()
    apiFetch.mockResolvedValueOnce(kunde('c2', 'Neu'))
    await saveCustomer({ name: 'Neu' } as Parameters<typeof saveCustomer>[0])

    expect((await ladeKundenstamm()).map(k => k.id)).toEqual(['c1', 'c2'])
    expect(apiFetch).toHaveBeenCalledTimes(2) // Stamm + Speichern, kein zweiter Stamm
  })

  it('ein Fehler wirft und bleibt nicht hängen: der nächste Aufruf versucht es neu', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'))
    await expect(ladeKundenstamm()).rejects.toThrow('offline')
    apiFetch.mockResolvedValueOnce([kunde('c1', 'Muster')])
    expect(await ladeKundenstamm()).toEqual([kunde('c1', 'Muster')])
  })
})
