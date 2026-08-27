import { beforeEach, describe, expect, it } from 'vitest'
import { captureDeepLink, parseDeepLink, takeDeepLink } from './deepLink'

describe('parseDeepLink', () => {
  it('liest Projekt und Reiter', () => {
    expect(parseDeepLink('#/admin/projects/abc-123/reports'))
      .toEqual({ projectId: 'abc-123', tab: 'reports' })
    expect(parseDeepLink('#/admin/projects/abc-123/quotes'))
      .toEqual({ projectId: 'abc-123', tab: 'quotes' })
  })

  it('faellt ohne Reiter auf die Projekt-Details zurueck', () => {
    expect(parseDeepLink('#/admin/projects/abc-123')?.tab).toBe('details')
  })

  it('faellt bei unbekanntem Reiter auf die Projekt-Details zurueck', () => {
    // Das Projekt ist die Hauptsache — ein Tippfehler im Reiter darf den ganzen
    // Sprung nicht verwerfen.
    expect(parseDeepLink('#/admin/projects/abc-123/rapporte')?.tab).toBe('details')
  })

  it('dekodiert die Projekt-id', () => {
    expect(parseDeepLink('#/admin/projects/a%2Fb/reports')?.projectId).toBe('a/b')
  })

  it('ignoriert alles andere', () => {
    expect(parseDeepLink('')).toBeNull()
    expect(parseDeepLink('#notif=%7B%7D')).toBeNull()
    expect(parseDeepLink('#/admin/projects/')).toBeNull()
    expect(parseDeepLink('#/admin/quotes/7')).toBeNull()
    // Kaputt kodiert (abgeschnittener %-Escape aus einem Mailclient)
    expect(parseDeepLink('#/admin/projects/a%2/reports')).toBeNull()
  })
})

describe('captureDeepLink / takeDeepLink', () => {
  beforeEach(() => {
    takeDeepLink()   // Modulzustand leeren
    history.replaceState(null, '', '/')
  })

  it('merkt den Sprung und gibt ihn genau einmal heraus', () => {
    captureDeepLink('#/admin/projects/p1/reports')
    expect(takeDeepLink()).toEqual({ projectId: 'p1', tab: 'reports' })
    expect(takeDeepLink()).toBeNull()
  })

  it('raeumt den Hash aus der Adresszeile', () => {
    // Sonst wiederholte jedes F5 denselben Sprung.
    history.replaceState(null, '', '/?x=1#/admin/projects/p1/reports')
    captureDeepLink('#/admin/projects/p1/reports')
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?x=1')
  })

  it('laesst einen fremden Hash in Ruhe', () => {
    history.replaceState(null, '', '/#notif=%7B%7D')
    expect(captureDeepLink('#notif=%7B%7D')).toBeNull()
    expect(window.location.hash).toBe('#notif=%7B%7D')
    expect(takeDeepLink()).toBeNull()
  })
})
