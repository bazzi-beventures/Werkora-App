import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import EasterEggs from './EasterEggs'
import { EASTEREGG_RECHECK_EVENT } from '../../api/admin/eastereggs'
import type { UserInfo } from '../../api/auth'
import type { EasterEggStatus } from '../../api/admin/eastereggs'

// Spec docs/specs/eastereggs.md

const getEasterEggs = vi.hoisted(() => vi.fn())
vi.mock('../../api/admin/eastereggs', async (echt) => ({
  ...(await echt<typeof import('../../api/admin/eastereggs')>()),
  getEasterEggs,
}))

function nutzer(over: Partial<UserInfo> = {}): UserInfo {
  return {
    authorized_user_id: 'u-1', username: 'chef', display_name: 'Chefin',
    email: 'c@test.ch', staff_id: 's-1', staff_name: 'Chefin',
    tenant_id: 't-1', role: 'management',
    consent_version: '1.1', consent_required: false,
    enabled_modules: [],
    feature_flags: { eastereggs: { enabled: true } },
    ...over,
  }
}

function stand(over: Partial<EasterEggStatus> = {}): EasterEggStatus {
  return {
    projects: { count: 103, step: 100, milestone: 100 },
    revenue: { total: 128400.5, step: 100000, milestone: null, year: 2026 },
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
  getEasterEggs.mockReset()
  // jsdom hat kein Canvas. Ohne Stub protokolliert es bei jedem Test einen
  // "Not implemented"-Fehler; die Animation selbst ist hier nicht der Prüfstand.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
})

async function zeige(user = nutzer(), status: EasterEggStatus | null = stand()) {
  getEasterEggs.mockResolvedValue(status)
  render(<EasterEggs user={user} />)
  // Der Fetch läuft im Effekt — einen Tick warten, dann steht das Overlay.
  await screen.findByRole('dialog').catch(() => null)
}

describe('EasterEggs', () => {
  it('fragt gar nicht erst, wenn der Mandant das Flag aus hat', async () => {
    await zeige(nutzer({ feature_flags: { eastereggs: { enabled: false } } }))
    expect(getEasterEggs).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fragt gar nicht erst ohne Geschäftsleitungs-Rolle', async () => {
    // Die Jahresumsatz-Zahl in der Antwort ist der Grund — dieselbe Grenze
    // zieht der Endpunkt (require_management).
    await zeige(nutzer({ role: 'admin' }))
    expect(getEasterEggs).not.toHaveBeenCalled()
  })

  it('zeigt das Konfetti mit dem erreichten Meilenstein', async () => {
    await zeige()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('Projekte abgeschlossen')).toBeTruthy()
    expect(screen.getByText(/103 abgeschlossene Projekte/)).toBeTruthy()
  })

  it('zeigt nichts, solange kein Meilenstein erreicht ist', async () => {
    await zeige(nutzer(), stand({ projects: { count: 42, step: 100, milestone: null } }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zeigt nichts, wenn der Endpunkt nicht antwortet', async () => {
    await zeige(nutzer(), null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zeigt einen schon gefeierten Meilenstein nicht noch einmal', async () => {
    localStorage.setItem('easteregg-projects:u-1', '100')
    await zeige()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('merkt den Meilenstein beim Zeigen, nicht erst beim Wegklicken', async () => {
    // Wer mitten in der Animation neu lädt, hat ihn gesehen.
    await zeige()
    expect(localStorage.getItem('easteregg-projects:u-1')).toBe('100')
  })

  it('lässt sich mit «Weiter arbeiten» wegklicken', async () => {
    await zeige()
    fireEvent.click(screen.getByRole('button', { name: 'Weiter arbeiten' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lässt sich mit Escape wegklicken', async () => {
    await zeige()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zeigt das Geld-Meme mit dem Betrag in Schweizer Schreibweise', async () => {
    await zeige(nutzer(), stand({
      projects: { count: 42, step: 100, milestone: null },
      revenue: { total: 128400.5, step: 100000, milestone: 100000, year: 2026 },
    }))
    expect(screen.getByText(/CHF 100’000|CHF 100'000/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nochmal Geld werfen' })).toBeTruthy()
  })

  it('zeigt beide Eier nacheinander, nicht übereinander', async () => {
    await zeige(nutzer(), stand({
      revenue: { total: 128400.5, step: 100000, milestone: 100000, year: 2026 },
    }))
    // Zuerst das Konfetti …
    expect(screen.getByText('Projekte abgeschlossen')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nochmal Geld werfen' })).toBeNull()
    // … und nach dem Wegklicken das Meme.
    fireEvent.click(screen.getByRole('button', { name: 'Weiter arbeiten' }))
    expect(screen.getByRole('button', { name: 'Nochmal Geld werfen' })).toBeTruthy()
    expect(screen.queryByText('Projekte abgeschlossen')).toBeNull()
  })
})

describe('EasterEggs — Nachfragen nach einer Aktion', () => {
  // Der Fehler, den dieser Block festhält: die Komponente fragte nur beim
  // Öffnen der Admin-App. Wer eine Rechnung erstellte, sah seinen Geldregen
  // erst beim nächsten Neuladen — also nicht in dem Moment, in dem es etwas
  // zu feiern gab.

  async function warte() {
    // Ein Tick für den await in `check`.
    await act(async () => { await Promise.resolve() })
  }

  it('zeigt den Geldregen nach einer erstellten Rechnung, ohne Neuladen', async () => {
    // Beim Start ist noch nichts erreicht …
    await zeige(nutzer(), stand({ projects: { count: 42, step: 100, milestone: null } }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // … dann kippt die Rechnung die Schwelle.
    getEasterEggs.mockResolvedValue(stand({
      projects: { count: 42, step: 100, milestone: null },
      revenue: { total: 12789, step: 5000, milestone: 10000, year: 2026 },
    }))
    await act(async () => { window.dispatchEvent(new CustomEvent(EASTEREGG_RECHECK_EVENT)) })
    await warte()

    expect(screen.getByRole('button', { name: 'Nochmal Geld werfen' })).toBeTruthy()
  })

  it('fragt nicht, wenn das Flag aus ist', async () => {
    await zeige(nutzer({ feature_flags: { eastereggs: { enabled: false } } }), stand())
    getEasterEggs.mockClear()
    await act(async () => { window.dispatchEvent(new CustomEvent(EASTEREGG_RECHECK_EVENT)) })
    await warte()
    expect(getEasterEggs).not.toHaveBeenCalled()
  })

  it('zieht ein laufendes Ei nicht unter dem Nutzer weg', async () => {
    await zeige()
    expect(screen.getByText('Projekte abgeschlossen')).toBeTruthy()

    // Dieselbe Antwort noch einmal: der Meilenstein ist inzwischen als gesehen
    // vermerkt, es darf also nichts dazukommen — und das offene Konfetti bleibt.
    await act(async () => { window.dispatchEvent(new CustomEvent(EASTEREGG_RECHECK_EVENT)) })
    await warte()
    expect(screen.getByText('Projekte abgeschlossen')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Weiter arbeiten' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hängt ein zweites Ei hinten an, statt das erste zu ersetzen', async () => {
    await zeige()
    getEasterEggs.mockResolvedValue(stand({
      revenue: { total: 12789, step: 5000, milestone: 10000, year: 2026 },
    }))
    await act(async () => { window.dispatchEvent(new CustomEvent(EASTEREGG_RECHECK_EVENT)) })
    await warte()

    // Vorne steht weiter das Konfetti …
    expect(screen.getByText('Projekte abgeschlossen')).toBeTruthy()
    // … und dahinter wartet das Meme.
    fireEvent.click(screen.getByRole('button', { name: 'Weiter arbeiten' }))
    expect(screen.getByRole('button', { name: 'Nochmal Geld werfen' })).toBeTruthy()
  })
})
