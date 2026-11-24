import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../shared/queryClient'
import type { Customer } from './customers'
import { KUNDENSTAMM_KEY, kundenstammEintragen, kundenstammEntfernen } from './kundenstamm'

const apiFetch = vi.fn()
vi.mock('../client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const kunde = (id: string, name: string) => ({ id, name }) as Customer
const stamm = () => queryClient.getQueryData<Customer[]>(KUNDENSTAMM_KEY)

afterEach(() => { queryClient.clear(); apiFetch.mockReset() })

describe('Kundenstamm-Zwischenspeicher', () => {
  it('trägt neue Kunden nur in einen schon geladenen Stamm ein', () => {
    kundenstammEintragen([kunde('c1', 'Muster')])
    // Nichts geladen → nichts erfunden: der nächste Screen holt den ganzen Stamm.
    expect(stamm()).toBeUndefined()

    queryClient.setQueryData(KUNDENSTAMM_KEY, [kunde('c1', 'Muster')])
    kundenstammEintragen([kunde('c2', 'Meier')])
    expect(stamm()?.map(k => k.id)).toEqual(['c1', 'c2'])
  })

  it('ersetzt einen geänderten Kunden statt ihn doppelt zu führen', () => {
    queryClient.setQueryData(KUNDENSTAMM_KEY, [kunde('c1', 'Muster'), kunde('c2', 'Meier')])
    kundenstammEintragen([kunde('c1', 'Muster AG')])
    expect(stamm()).toEqual([kunde('c1', 'Muster AG'), kunde('c2', 'Meier')])
  })

  it('nimmt gelöschte Kunden heraus', () => {
    queryClient.setQueryData(KUNDENSTAMM_KEY, [kunde('c1', 'Muster'), kunde('c2', 'Meier')])
    kundenstammEntfernen('c1')
    expect(stamm()?.map(k => k.id)).toEqual(['c2'])
  })

  it('saveCustomer und deleteCustomer ziehen den Speicher selbst nach', async () => {
    const { deleteCustomer, saveCustomer } = await import('./customers')
    queryClient.setQueryData(KUNDENSTAMM_KEY, [kunde('c1', 'Muster')])

    apiFetch.mockResolvedValueOnce(kunde('c9', 'Neu'))
    await saveCustomer({ name: 'Neu' } as Parameters<typeof saveCustomer>[0])
    expect(stamm()?.map(k => k.id)).toEqual(['c1', 'c9'])

    apiFetch.mockResolvedValueOnce(undefined)
    await deleteCustomer('c1')
    expect(stamm()?.map(k => k.id)).toEqual(['c9'])
  })
})
