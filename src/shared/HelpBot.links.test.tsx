import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HelpBot from './HelpBot'
import { historyFor, sourceLabels, type HelpMessage } from './helpChat'
import HelpBubble from './HelpBubble'
import { resolveHelpLink, isExternalLink } from './helpTargets'
import type { UserInfo } from '../api/auth'

// Spec docs/specs/hilfe-bot-masken-und-ablaeufe.md — Links auf die Maske,
// Quellen, Verlauf. Die API wird gemockt; geprüft wird, was der Nutzer sieht.
const askHelp = vi.fn()
vi.mock('../api/help', () => ({
  askHelp: (...a: unknown[]) => askHelp(...a),
}))

async function* stream(events: unknown[]) {
  for (const e of events) yield e
}

function user(role: string, modules: string[]): UserInfo {
  return { role, enabled_modules: modules } as unknown as UserInfo
}

const ADMIN = user('admin', ['invoicing', 'quotes', 'kpis', 'help_bot'])
const MGMT = user('management', ['invoicing', 'quotes', 'kpis', 'help_bot'])

async function ask(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Frage zur App stellen…'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
}

beforeEach(() => {
  askHelp.mockReset()
})

// ── resolveHelpLink (rein) ──────────────────────────────────────────────────

describe('resolveHelpLink', () => {
  it('löst eine erlaubte Maske der eigenen App auf', () => {
    expect(resolveHelpLink('#/admin/invoices', ADMIN, 'admin')?.screen).toBe('invoices')
  })

  it('lehnt die Maske der anderen App ab', () => {
    expect(resolveHelpLink('#/app/absenzen', ADMIN, 'admin')).toBeNull()
    expect(resolveHelpLink('#/admin/invoices', ADMIN, 'pwa')).toBeNull()
  })

  it('lehnt eine Maske ohne gebuchtes Modul ab', () => {
    expect(resolveHelpLink('#/admin/payment-reconciliation', ADMIN, 'admin')).toBeNull()
  })

  it('gibt Management-Masken nur der Geschäftsführung', () => {
    expect(resolveHelpLink('#/admin/kpis', ADMIN, 'admin')).toBeNull()
    expect(resolveHelpLink('#/admin/kpis', MGMT, 'admin')?.screen).toBe('kpis')
  })

  it('sperrt user_light für Projekte in der Monteur-App', () => {
    expect(resolveHelpLink('#/app/projekte', user('user_light', []), 'pwa')).toBeNull()
    expect(resolveHelpLink('#/app/projekte', user('user', []), 'pwa')?.screen).toBe('projekte')
  })

  it('lehnt Erfundenes, Handbuch-Anker und Unter-Reiter ab', () => {
    expect(resolveHelpLink('#/admin/gibtsnicht', MGMT, 'admin')).toBeNull()
    expect(resolveHelpLink('#66-rechnungen', MGMT, 'admin')).toBeNull()
    expect(resolveHelpLink('#/admin/projects/p-1/reports', MGMT, 'admin')).toBeNull()
    expect(resolveHelpLink('javascript:alert(1)', MGMT, 'admin')).toBeNull()
    expect(resolveHelpLink(undefined, MGMT, 'admin')).toBeNull()
  })

  it('erkennt externe Links', () => {
    expect(isExternalLink('https://example.ch')).toBe(true)
    expect(isExternalLink('#/admin/invoices')).toBe(false)
    expect(isExternalLink('javascript:alert(1)')).toBe(false)
  })
})

// ── historyFor / sourceLabels (rein) ────────────────────────────────────────

describe('historyFor', () => {
  const msg = (id: number, role: 'user' | 'assistant', text: string, error?: string): HelpMessage =>
    ({ id, role, text, error })

  it('nimmt nur vollständige Wortwechsel, höchstens drei', () => {
    const messages = [
      msg(1, 'user', 'q1'), msg(2, 'assistant', 'a1'),
      msg(3, 'user', 'q2'), msg(4, 'assistant', '', 'Fehler'),
      msg(5, 'user', 'q3'), msg(6, 'assistant', 'a3'),
      msg(7, 'user', 'q4'), msg(8, 'assistant', 'a4'),
      msg(9, 'user', 'q5'), msg(10, 'assistant', 'a5'),
    ]
    expect(historyFor(messages).map(h => h.text)).toEqual(['q3', 'a3', 'q4', 'a4', 'q5', 'a5'])
  })

  it('kürzt lange Nachrichten', () => {
    const h = historyFor([msg(1, 'user', 'x'.repeat(5000)), msg(2, 'assistant', 'a')])
    expect(h[0].text).toHaveLength(1500)
  })
})

describe('sourceLabels', () => {
  it('bevorzugt den Anzeigenamen, dedupliziert und kappt bei drei', () => {
    expect(sourceLabels([
      { section: 'x.md > A', label: 'A' },
      { section: 'x.md > A', label: 'A' },
      { section: 'alt > B' },
      { section: 'x.md > C', label: 'C' },
      { section: 'x.md > D', label: 'D' },
    ])).toEqual(['A', 'alt > B', 'C'])
  })
})

// ── HelpBot: Darstellung ────────────────────────────────────────────────────

describe('HelpBot — Links in der Antwort', () => {
  it('macht einen erlaubten Masken-Link zum Knopf und öffnet die Maske', async () => {
    askHelp.mockReturnValue(stream([
      { type: 'delta', text: 'Öffnen Sie [Rechnungen](#/admin/invoices) und klicken Sie **Neue Rechnung**.' },
      { type: 'done' },
    ]))
    const onNavigate = vi.fn()
    render(<HelpBot app="admin" route="dashboard" user={ADMIN} onNavigate={onNavigate} />)
    await ask('Wie erstelle ich eine Rechnung?')

    const knopf = await screen.findByRole('button', { name: /Rechnungen/ })
    fireEvent.click(knopf)
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ app: 'admin', screen: 'invoices' }))
    expect(askHelp).toHaveBeenCalledWith(
      'Wie erstelle ich eine Rechnung?',
      { app: 'admin', route: 'dashboard', history: [] },
    )
  })

  it('lässt unerlaubte und erfundene Links als reinen Text stehen', async () => {
    askHelp.mockReturnValue(stream([
      { type: 'delta', text: 'Siehe [Kennzahlen](#/admin/kpis) und [Kapitel 6.6](#66-rechnungen).' },
      { type: 'done' },
    ]))
    render(<HelpBot app="admin" user={ADMIN} onNavigate={vi.fn()} />)
    await ask('Wo sehe ich den Umsatz?')

    await screen.findByText(/Kennzahlen/)
    expect(screen.queryByRole('button', { name: /Kennzahlen/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Kennzahlen/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Kapitel 6.6/ })).toBeNull()
  })

  it('öffnet externe Links in einem neuen Tab', async () => {
    askHelp.mockReturnValue(stream([
      { type: 'delta', text: 'Mehr unter [Hersteller](https://example.ch/doku).' },
      { type: 'done' },
    ]))
    render(<HelpBot app="admin" user={ADMIN} onNavigate={vi.fn()} />)
    await ask('Doku?')

    const link = await screen.findByRole('link', { name: 'Hersteller' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('zeigt die Quellen unter der Antwort', async () => {
    askHelp.mockReturnValue(stream([
      { type: 'delta', text: 'So geht es.' },
      { type: 'sources', sources: [
        { section: '_system_Admin_Handbuch.md > X', label: '6.6 Rechnungen › Rechnung generieren' },
        { section: '_system_Admin_Handbuch.md > X', label: '6.6 Rechnungen › Rechnung generieren' },
      ] },
      { type: 'done' },
    ]))
    render(<HelpBot app="admin" user={ADMIN} />)
    await ask('Rechnung?')

    expect(await screen.findByText('Aus dem Handbuch: 6.6 Rechnungen › Rechnung generieren')).toBeTruthy()
  })

  it('schickt den Verlauf mit der Anschlussfrage mit', async () => {
    askHelp
      .mockReturnValueOnce(stream([{ type: 'delta', text: 'Erst Offerte.' }, { type: 'done' }]))
      .mockReturnValueOnce(stream([{ type: 'delta', text: 'Dann Rechnung.' }, { type: 'done' }]))
    render(<HelpBot app="admin" user={ADMIN} />)
    await ask('Vom Auftrag zur Rechnung?')
    await screen.findByText('Erst Offerte.')
    await ask('und dann?')
    await screen.findByText('Dann Rechnung.')

    expect(askHelp.mock.calls[1][1].history).toEqual([
      { role: 'user', text: 'Vom Auftrag zur Rechnung?' },
      { role: 'assistant', text: 'Erst Offerte.' },
    ])
  })
})

// ── HelpBubble: Verlauf überlebt das Schliessen, Sprung schliesst am Handy ──

describe('HelpBubble — Sprung aus dem Hilfe-Chat', () => {
  // Der FAB ist das einzige Element mit aria-expanded (siehe HelpBubble.test.tsx).
  function openBubble() {
    fireEvent.click(screen.getByRole('button', { expanded: false }))
  }

  it('schliesst auf schmalem Bildschirm und behält den Verlauf', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    askHelp.mockReturnValue(stream([
      { type: 'delta', text: 'Öffnen Sie [Rechnungen](#/admin/invoices).' },
      { type: 'done' },
    ]))
    const onNavigate = vi.fn()
    render(<HelpBubble showHelp appContext="admin" route="dashboard" user={ADMIN} onNavigate={onNavigate} />)
    openBubble()
    await ask('Rechnung?')
    fireEvent.click(await screen.findByRole('button', { name: /Rechnungen/ }))

    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ screen: 'invoices' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('Frage zur App stellen…')).toBeNull())

    openBubble()
    expect(await screen.findByText('Rechnung?')).toBeTruthy()
  })
})
