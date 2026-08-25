import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAdminNav } from './useAdminNav'

// Der Admin-Bereich führt einen eigenen Verlauf (Screen + Detail-ID). AdminApp
// hängt den Hardware-Zurück an `previous` — hier wird geprüft, dass der Wert
// stimmt und dass das Zurücknavigieren den Verlauf abträgt statt ihn zu
// verlängern.
describe('useAdminNav', () => {
  it('startet auf dem Dashboard ohne Verlauf', () => {
    const { result } = renderHook(() => useAdminNav())
    expect(result.current.screen).toBe('dashboard')
    expect(result.current.previous).toBeNull()
  })

  it('merkt sich die verlassene Station', () => {
    const { result } = renderHook(() => useAdminNav())

    act(() => result.current.nav('projects'))
    expect(result.current.previous).toEqual({ screen: 'dashboard', detailId: null })

    act(() => result.current.nav('invoices'))
    expect(result.current.previous).toEqual({ screen: 'projects', detailId: null })
  })

  it('trägt den Verlauf ab, wenn auf `previous` navigiert wird', () => {
    const { result } = renderHook(() => useAdminNav())

    act(() => result.current.nav('projects'))
    act(() => result.current.nav('invoices'))

    // Genau das macht AdminApp beim Zurück-Druck.
    act(() => {
      const prev = result.current.previous!
      result.current.nav(prev.screen, prev.detailId ?? undefined)
    })
    expect(result.current.screen).toBe('projects')
    expect(result.current.previous).toEqual({ screen: 'dashboard', detailId: null })

    act(() => {
      const prev = result.current.previous!
      result.current.nav(prev.screen, prev.detailId ?? undefined)
    })
    expect(result.current.screen).toBe('dashboard')
    expect(result.current.previous).toBeNull()
  })

  it('behandelt denselben Screen mit anderer Detail-ID als eigene Station', () => {
    const { result } = renderHook(() => useAdminNav())

    act(() => result.current.nav('projects'))
    act(() => result.current.nav('projects', 'new'))

    expect(result.current.detailId).toBe('new')
    expect(result.current.previous).toEqual({ screen: 'projects', detailId: null })
  })

  it('zählt `resetTick` hoch, wenn dieselbe Station erneut angesteuert wird', () => {
    const { result } = renderHook(() => useAdminNav())
    const before = result.current.resetTick

    act(() => result.current.nav('dashboard'))

    expect(result.current.resetTick).toBe(before + 1)
    // Kein echter Wechsel ⇒ nichts im Verlauf, sonst führte Zurück auf die
    // Station, auf der man schon steht.
    expect(result.current.previous).toBeNull()
  })

  it('lässt den Verlauf unberührt, wenn ein Screen seinen Deep-Link verbraucht', () => {
    const { result } = renderHook(() => useAdminNav())

    act(() => result.current.nav('projects', 'new'))
    act(() => result.current.clearDetail())

    expect(result.current.detailId).toBeNull()
    // Zurück führt weiterhin aufs Dashboard — nicht auf «projects mit ?new».
    expect(result.current.previous).toEqual({ screen: 'dashboard', detailId: null })
  })
})
