import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { resolveScheduleDistances } from '../../api/admin'
import { DISTANCE_SETTLE_MS, pairKey, useScheduleDistances } from './scheduleShared'

// Die Einsatzplanung frischt ihre Termine alle 2 s auf. Die Fahrdistanz
// (Routenanfrage beim Server, dort gedeckelt) soll dabei nicht jeden
// Zwischenstand mitnehmen: nach dem ersten Laden erst nach ein paar Sekunden
// Ruhe fragen.

vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, resolveScheduleDistances: vi.fn() }
})

const AB = pairKey('Astrasse 1, Winterthur', 'Bstrasse 2, Seuzach')!
const BC = pairKey('Bstrasse 2, Seuzach', 'Cweg 3, Wil')!
const CD = pairKey('Cweg 3, Wil', 'Dgasse 4, Uster')!

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.mocked(resolveScheduleDistances).mockResolvedValue({ distances: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useScheduleDistances', () => {
  it('fragt beim Öffnen sofort, danach erst nach der Ruhezeit', async () => {
    const { rerender } = renderHook(({ keys }) => useScheduleDistances(keys), {
      initialProps: { keys: [AB] },
    })
    expect(resolveScheduleDistances).toHaveBeenCalledTimes(1)

    // Zwei schnelle Wechsel (Live-Abruf, Verschieben) — noch keine Anfrage.
    rerender({ keys: [AB, BC] })
    await act(async () => { await vi.advanceTimersByTimeAsync(DISTANCE_SETTLE_MS - 1000) })
    rerender({ keys: [AB, BC, CD] })
    await act(async () => { await vi.advanceTimersByTimeAsync(DISTANCE_SETTLE_MS - 1000) })
    expect(resolveScheduleDistances).toHaveBeenCalledTimes(1)

    // Ruhe: eine gebündelte Anfrage mit genau den neuen Paaren.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(resolveScheduleDistances).toHaveBeenCalledTimes(2)
    expect(vi.mocked(resolveScheduleDistances).mock.calls[1][0]).toHaveLength(2)
  })

  it('verwirft eine Antwort nicht, nur weil sich die Paare inzwischen geändert haben', async () => {
    let answer!: (v: { distances: { a: string; b: string; km: number }[] }) => void
    vi.mocked(resolveScheduleDistances).mockImplementationOnce(
      () => new Promise(r => { answer = r }),
    )
    const { result, rerender } = renderHook(({ keys }) => useScheduleDistances(keys), {
      initialProps: { keys: [AB] },
    })
    rerender({ keys: [AB, BC] })
    await act(async () => {
      answer({ distances: [{ a: 'Astrasse 1, Winterthur', b: 'Bstrasse 2, Seuzach', km: 4.2 }] })
    })

    const a = { start_time: '08:00', object_address: 'Astrasse 1, Winterthur' }
    const b = { start_time: '10:00', object_address: 'Bstrasse 2, Seuzach' }
    expect(result.current(a as never, b as never)).toBe(4.2)
  })
})
