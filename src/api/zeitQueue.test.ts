import { describe, it, expect, vi } from 'vitest'
import { ChatResponse } from './chat'
import { drainActions, outcomeOf, QueuedAction, isQueueStuck, MAX_DRAIN_ATTEMPTS } from './zeitQueue'

const item = (action: QueuedAction['action'], recorded_at = '2026-08-09T06:00:00Z'): QueuedAction =>
  ({ action, recorded_at })

const reply = (outcome: ChatResponse['outcome'], text = 'ok'): ChatResponse =>
  ({ reply: text, action_taken: outcome === 'applied' ? 'x' : null, outcome })

describe('outcomeOf', () => {
  it('nimmt das Feld des Backends, wenn vorhanden', () => {
    expect(outcomeOf(reply('noop'))).toBe('noop')
  })

  it('leitet aus action_taken ab, solange das Backend noch alt ist', () => {
    expect(outcomeOf({ reply: 'ok', action_taken: 'clock_in' })).toBe('applied')
    expect(outcomeOf({ reply: 'Du bist nicht eingestempelt.', action_taken: null })).toBe('rejected')
  })
})

describe('drainActions', () => {
  it('leert die Queue, wenn alles durchgeht', async () => {
    const send = vi.fn().mockResolvedValue(reply('applied'))
    const res = await drainActions([item('clock_in'), item('clock_out')], send)

    expect(res.remaining).toEqual([])
    expect(res.applied).toBe(2)
    expect(res.rejected).toEqual([])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('behandelt einen bereits gebuchten Stempel als erledigt', async () => {
    const send = vi.fn().mockResolvedValue(reply('noop'))
    const res = await drainActions([item('clock_in')], send)

    expect(res.remaining).toEqual([])
    expect(res.applied).toBe(1)
  })

  it('hält bei einem Netzfehler an und lässt den Rest in Reihenfolge liegen', async () => {
    // Der eigentliche Datenverlust-Fall: früher lief die Schleife weiter und
    // schickte das Ausstempeln zu einer Session, die es noch nicht gab.
    const send = vi.fn().mockRejectedValue(new Error('offline'))
    const queue = [item('clock_in'), item('clock_out')]
    const res = await drainActions(queue, send)

    expect(send).toHaveBeenCalledTimes(1)
    expect(res.remaining.map(q => q.action)).toEqual(['clock_in', 'clock_out'])
    expect(res.applied).toBe(0)
  })

  it('zählt attempts nur beim tatsächlich versuchten Eintrag hoch', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'))
    const res = await drainActions([item('clock_in'), item('clock_out')], send)

    expect(res.remaining[0].attempts).toBe(1)
    expect(res.remaining[1].attempts).toBeUndefined()
  })

  it('hält auch bei einem Server-Fehler an, nicht nur bei Netzfehlern', async () => {
    const send = vi.fn().mockResolvedValue(reply('retry', 'Fehler beim Einstempeln.'))
    const res = await drainActions([item('clock_in'), item('clock_out')], send)

    expect(send).toHaveBeenCalledTimes(1)
    expect(res.remaining).toHaveLength(2)
  })

  it('arbeitet nach dem Anhalten beim nächsten Lauf weiter', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(reply('applied'))

    const first = await drainActions([item('clock_in'), item('clock_out')], send)
    const second = await drainActions(first.remaining, send)

    expect(second.remaining).toEqual([])
    expect(second.applied).toBe(2)
  })

  it('verwirft einen dauerhaft abgelehnten Stempel und meldet ihn', async () => {
    const send = vi.fn().mockResolvedValue(reply('rejected', 'Dieser Stempel ist älter als 72 Stunden.'))
    const res = await drainActions([item('clock_in')], send)

    expect(res.remaining).toEqual([])
    expect(res.rejected).toHaveLength(1)
    expect(res.rejected[0].reply).toContain('72 Stunden')
  })

  it('macht nach einer Ablehnung weiter — der Server lehnt Folgestempel selbst ab', async () => {
    const send = vi.fn().mockResolvedValue(reply('rejected', 'zu alt'))
    const res = await drainActions([item('clock_in'), item('clock_out')], send)

    expect(send).toHaveBeenCalledTimes(2)
    expect(res.rejected).toHaveLength(2)
    expect(res.remaining).toEqual([])
  })

  it('sendet die Einträge in der Reihenfolge der Queue', async () => {
    const seen: string[] = []
    const send = vi.fn().mockImplementation(async (q: QueuedAction) => {
      seen.push(q.action)
      return reply('applied')
    })
    await drainActions([item('clock_in'), item('start_break'), item('end_break'), item('clock_out')], send)

    expect(seen).toEqual(['clock_in', 'start_break', 'end_break', 'clock_out'])
  })
})

describe('isQueueStuck', () => {
  it('schlägt erst beim Erreichen des Deckels an', () => {
    expect(isQueueStuck([{ ...item('clock_in'), attempts: MAX_DRAIN_ATTEMPTS - 1 }])).toBe(false)
    expect(isQueueStuck([{ ...item('clock_in'), attempts: MAX_DRAIN_ATTEMPTS }])).toBe(true)
  })
})
