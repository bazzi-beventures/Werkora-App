import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DOWN_TTL_MS,
  connectionSeemsDown,
  noteNetworkFailure,
  noteRequestSuccess,
  resetConnectionHealth,
} from './connectionHealth'

// «Trägt die Leitung?» — docs/specs/offline-modus.md §4.5.2.
//
// Der Grund für dieses Modul ist die Tiefgarage: ein Balken Empfang,
// `navigator.onLine === true`, und kein Request kommt durch. Hinge der Einstieg
// ins Offline-Formular allein am Flag, ginge das Feature genau dort nie auf, wo
// es gebraucht wird.

beforeEach(resetConnectionHealth)
afterEach(() => vi.restoreAllMocks())

function browserSagt(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

describe('connectionSeemsDown', () => {
  it('ist am Anfang nicht «weg»', () => {
    browserSagt(true)
    expect(connectionSeemsDown()).toBe(false)
  })

  it('folgt dem Browser, wenn der offline sagt', () => {
    browserSagt(false)
    expect(connectionSeemsDown()).toBe(true)
  })

  it('erkennt die Tiefgarage: Browser sagt online, nichts kommt durch', () => {
    // DER Fall. Ohne dieses Modul wäre die Antwort hier `false` und der Monteur
    // stünde vor einem Chat, der nicht antwortet.
    browserSagt(true)
    const t0 = 1_000_000
    noteNetworkFailure(t0)
    expect(connectionSeemsDown(t0 + 1000)).toBe(true)
  })

  it('ist sofort wieder gut, wenn ein Request durchkommt', () => {
    browserSagt(true)
    const t0 = 1_000_000
    noteNetworkFailure(t0)
    noteRequestSuccess(t0 + 500)
    expect(connectionSeemsDown(t0 + 1000)).toBe(false)
  })

  it('verfällt von selbst, wenn nichts mehr passiert', () => {
    // Ohne Verfall bliebe eine einzelne Störung den ganzen Nachmittag stehen —
    // und der Monteur bekäme das Formular angeboten, während der Chat längst
    // wieder ginge.
    browserSagt(true)
    const t0 = 1_000_000
    noteNetworkFailure(t0)
    expect(connectionSeemsDown(t0 + DOWN_TTL_MS - 1)).toBe(true)
    expect(connectionSeemsDown(t0 + DOWN_TTL_MS + 1)).toBe(false)
  })

  it('bleibt «weg», solange nur Fehlschläge nachkommen', () => {
    browserSagt(true)
    const t0 = 1_000_000
    noteNetworkFailure(t0)
    noteNetworkFailure(t0 + DOWN_TTL_MS - 100)
    expect(connectionSeemsDown(t0 + DOWN_TTL_MS + 100)).toBe(true)
  })

  it('lässt sich zurücksetzen', () => {
    browserSagt(true)
    noteNetworkFailure(1_000_000)
    resetConnectionHealth()
    expect(connectionSeemsDown(1_000_001)).toBe(false)
  })
})

describe('Ereignis für die Oberfläche', () => {
  it('meldet den Wechsel — und nur den', () => {
    // Bei jedem gelungenen Request zu feuern hiesse, die halbe App bei jedem
    // Listen-Load neu zu zeichnen.
    browserSagt(true)
    const gesehen = vi.fn()
    window.addEventListener('werkora-connection', gesehen)
    try {
      const t0 = 1_000_000
      noteRequestSuccess(t0)          // war gut, bleibt gut → still
      expect(gesehen).not.toHaveBeenCalled()

      noteNetworkFailure(t0 + 100)    // gut → weg
      expect(gesehen).toHaveBeenCalledTimes(1)

      noteNetworkFailure(t0 + 200)    // weg → weg
      expect(gesehen).toHaveBeenCalledTimes(1)

      noteRequestSuccess(t0 + 300)    // weg → gut
      expect(gesehen).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener('werkora-connection', gesehen)
    }
  })
})
