import { beforeEach, describe, expect, it } from 'vitest'
import {
  captureDeepLink, parseDeepLink, rememberDeepLink, takeCountDeepLink,
  takeDeepLink, takeProjectDeepLink,
} from './deepLink'

/** Schmalere Sicht auf die Union, damit die Projekt-Zusicherungen kurz bleiben. */
function projekt(hash: string) {
  const link = parseDeepLink(hash)
  return link?.kind === 'project' ? link : null
}

describe('parseDeepLink', () => {
  it('liest Projekt und Reiter', () => {
    expect(parseDeepLink('#/admin/projects/abc-123/reports'))
      .toEqual({ kind: 'project', projectId: 'abc-123', tab: 'reports' })
    expect(parseDeepLink('#/admin/projects/abc-123/quotes'))
      .toEqual({ kind: 'project', projectId: 'abc-123', tab: 'quotes' })
  })

  it('faellt ohne Reiter auf die Projekt-Details zurueck', () => {
    expect(projekt('#/admin/projects/abc-123')?.tab).toBe('details')
  })

  it('faellt bei unbekanntem Reiter auf die Projekt-Details zurueck', () => {
    // Das Projekt ist die Hauptsache — ein Tippfehler im Reiter darf den ganzen
    // Sprung nicht verwerfen.
    expect(projekt('#/admin/projects/abc-123/rapporte')?.tab).toBe('details')
  })

  it('dekodiert die Projekt-id', () => {
    expect(projekt('#/admin/projects/a%2Fb/reports')?.projectId).toBe('a/b')
  })

  it('ignoriert alles andere', () => {
    expect(parseDeepLink('')).toBeNull()
    expect(parseDeepLink('#notif=%7B%7D')).toBeNull()
    expect(parseDeepLink('#/admin/projects/')).toBeNull()
    expect(parseDeepLink('#/admin/quotes/7')).toBeNull()
    expect(parseDeepLink('#/inventur/')).toBeNull()
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
    expect(takeDeepLink()).toEqual({ kind: 'project', projectId: 'p1', tab: 'reports' })
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

// ── Inventur-Sprung (docs/specs/rollierende-inventur.md §10.1) ──────────────
//
// Die Adresse trägt bewusst kein `/admin/`: Sie muss in beiden Oberflächen
// landen, weil ein Inventurmanager mit Rolle `user` gar nicht in die Admin-App
// kommt. Wer wohin gehört, entscheidet App.tsx — nicht die Adresse.

describe('Inventur-Deep-Link', () => {
  beforeEach(() => {
    takeDeepLink()
    history.replaceState(null, '', '/')
  })

  it('liest die Zählung', () => {
    expect(parseDeepLink('#/inventur/c-1')).toEqual({ kind: 'count', countId: 'c-1' })
    expect(parseDeepLink('#/inventur/a%2Fb')).toEqual({ kind: 'count', countId: 'a/b' })
  })

  it('verwechselt die beiden Sorten nicht', () => {
    // Sonst schluckte die Admin-App den Inventur-Sprung — und der Monteur, für
    // den er gedacht war, landete nirgends.
    captureDeepLink('#/inventur/c-1')
    expect(takeProjectDeepLink()).toBeNull()
    expect(takeCountDeepLink()).toEqual({ kind: 'count', countId: 'c-1' })
    expect(takeCountDeepLink()).toBeNull()

    captureDeepLink('#/admin/projects/p1/reports')
    expect(takeCountDeepLink()).toBeNull()
    expect(takeProjectDeepLink()?.projectId).toBe('p1')
  })

  it('merkt sich die Adresse einer Push, ohne die Adresszeile anzufassen', () => {
    // Steht die App schon offen, kommt die Meldung als Nachricht vom Service
    // Worker — im Hash steht dann nichts.
    history.replaceState(null, '', '/')
    expect(rememberDeepLink('https://app.example.ch/#/inventur/c-9')).toBe(true)
    expect(window.location.hash).toBe('')
    expect(takeCountDeepLink()).toEqual({ kind: 'count', countId: 'c-9' })
  })

  it('lässt eine Push ohne Sprungziel unangetastet', () => {
    expect(rememberDeepLink('/')).toBe(false)
    expect(takeDeepLink()).toBeNull()
  })
})
