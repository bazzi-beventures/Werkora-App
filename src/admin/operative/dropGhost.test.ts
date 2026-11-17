import { describe, it, expect } from 'vitest'
import { dragDauerMin, ghostLabel } from './dropGhost'

describe('dropGhost', () => {
  it('Dauer aus Start- und Endzeit, ganztägig oder ohne Ende ohne Dauer', () => {
    expect(dragDauerMin({ start_time: '08:00:00', end_time: '10:30:00' })).toBe(150)
    expect(dragDauerMin({ start_time: '08:00', end_time: null })).toBeNull()
    expect(dragDauerMin({ start_time: null, end_time: null })).toBeNull()
    expect(dragDauerMin({ start_time: '10:00', end_time: '09:00' })).toBeNull()
  })

  it('Beschriftung «von–bis», ohne Dauer nur die Startzeit', () => {
    expect(ghostLabel('08:15', 120)).toBe('08:15–10:15')
    expect(ghostLabel('08:15', null)).toBe('08:15')
  })
})
