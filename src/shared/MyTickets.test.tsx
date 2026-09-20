import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SupportForm from './SupportForm'
import HelpBubble from './HelpBubble'
import { leereMeldungen } from './supportTestFixtures'
import type { MySupportTicket } from '../api/support'

// Spec docs/specs/support-antwort.md §4

const fetchMySupportTickets = vi.fn()
const markSupportRepliesRead = vi.fn()

vi.mock('../api/support', async () => {
  const actual = await vi.importActual<typeof import('../api/support')>('../api/support')
  return {
    ...actual,
    sendSupportTicket: vi.fn(),
    fetchMySupportTickets: (...args: unknown[]) => fetchMySupportTickets(...args),
    markSupportRepliesRead: (...args: unknown[]) => markSupportRepliesRead(...args),
  }
})

// Der Hilfe-Chat lädt beim Mount Daten — für diese Tests irrelevant.
vi.mock('./HelpBot', () => ({ default: () => <div data-testid="helpbot" /> }))

const BEANTWORTET: MySupportTicket = {
  id: 't1',
  ticket_no: 1042,
  reference: 'WS-1042',
  message: 'Rapport speichert nicht',
  status: 'erledigt',
  created_at: '2026-09-15T08:00:00Z',
  replies: [{ text: 'Der Fehler ist behoben.', at: '2026-09-18T09:00:00Z', by: 'Luca' }],
  last_reply_at: '2026-09-18T09:00:00Z',
  reply_read_at: null,
}

beforeEach(() => {
  fetchMySupportTickets.mockReset()
  markSupportRepliesRead.mockReset()
  fetchMySupportTickets.mockResolvedValue({ tickets: [], unread: 0 })
  markSupportRepliesRead.mockResolvedValue({ ok: true })
  localStorage.clear()
})

describe('SupportForm — zwei Ansichten', () => {
  it('startet beim Melde-Formular, wenn nichts wartet', () => {
    render(<SupportForm mine={leereMeldungen()} route="dashboard" appContext="pwa" />)
    expect(screen.queryByLabelText('Was ist passiert?')).not.toBeNull()
  })

  it('öffnet direkt «Meine Meldungen», wenn eine Antwort ungelesen ist', () => {
    render(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET], unread: 1 })}
        route="dashboard" appContext="pwa"
      />,
    )
    // Wer die Blase aufmacht, während eine Antwort daliegt, soll sie sehen.
    expect(screen.queryByText('Der Fehler ist behoben.')).not.toBeNull()
    expect(screen.queryByLabelText('Was ist passiert?')).toBeNull()
  })

  it('quittiert die Antworten genau einmal, wenn die Liste erscheint', async () => {
    const markRead = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET], unread: 1, markRead })}
        route="dashboard" appContext="pwa"
      />,
    )
    rerender(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET], unread: 1, markRead })}
        route="dashboard" appContext="pwa"
      />,
    )
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1))
  })

  it('wechselt über den Umschalter hin und her', () => {
    render(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET] })}
        route="dashboard" appContext="pwa"
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /Meine Meldungen/ }))
    expect(screen.queryByText('Der Fehler ist behoben.')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Problem melden' }))
    expect(screen.queryByLabelText('Was ist passiert?')).not.toBeNull()
  })

  it('zeigt im Formular einen Hinweis, wenn eine Antwort nachträglich hereinkommt', () => {
    // Startwert «melden», weil die Liste beim Mounten noch leer war.
    const { rerender } = render(
      <SupportForm mine={leereMeldungen()} route="dashboard" appContext="pwa" />,
    )
    rerender(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET], unread: 1 })}
        route="dashboard" appContext="pwa"
      />,
    )
    const hinweis = screen.getByRole('button', { name: /Antwort auf deine Meldung/ })
    fireEvent.click(hinweis)
    expect(screen.queryByText('Der Fehler ist behoben.')).not.toBeNull()
  })
})

describe('SupportForm — «Passt nicht»', () => {
  it('belegt das Formular mit dem Bezug vor, statt das alte Ticket aufzumachen', () => {
    render(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET], unread: 1 })}
        route="dashboard" appContext="pwa"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Passt nicht' }))
    const feld = screen.getByLabelText('Was ist passiert?') as HTMLTextAreaElement
    // Eine NEUE Meldung mit frischem Aktivitäts-Snapshot (Spec A8) — der alte
    // ist eingefroren und Wochen her.
    expect(feld.value).toBe('[Bezug: WS-1042] ')
  })

  it('überschreibt einen bereits getippten Text nicht', () => {
    render(
      <SupportForm
        mine={leereMeldungen({ tickets: [BEANTWORTET] })}
        route="dashboard" appContext="pwa"
      />,
    )
    fireEvent.change(screen.getByLabelText('Was ist passiert?'), {
      target: { value: 'Halb getippt' },
    })
    fireEvent.click(screen.getByRole('tab', { name: /Meine Meldungen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Passt nicht' }))
    const feld = screen.getByLabelText('Was ist passiert?') as HTMLTextAreaElement
    expect(feld.value).toBe('Halb getippt')
  })
})

describe('MyTickets — leere und kaputte Zustände', () => {
  it('sagt es, wenn noch nichts gemeldet wurde', () => {
    render(<SupportForm mine={leereMeldungen()} route="d" appContext="pwa" />)
    fireEvent.click(screen.getByRole('tab', { name: /Meine Meldungen/ }))
    expect(screen.queryByText(/noch nichts gemeldet/)).not.toBeNull()
  })

  it('ein fehlgeschlagenes Laden blockiert das Melden nicht', () => {
    render(
      <SupportForm mine={leereMeldungen({ failed: true })} route="d" appContext="pwa" />,
    )
    // Formular bleibt bedienbar …
    expect(screen.queryByLabelText('Was ist passiert?')).not.toBeNull()
    // … und die Liste erklärt sich, statt leer auszusehen.
    fireEvent.click(screen.getByRole('tab', { name: /Meine Meldungen/ }))
    expect(screen.queryByText(/konnten nicht geladen werden/)).not.toBeNull()
  })

  it('zeigt bei einer Meldung ohne Antwort keinen Passt/Passt-nicht-Knopf', () => {
    const offen = { ...BEANTWORTET, replies: [], last_reply_at: null, status: 'offen' as const }
    render(
      <SupportForm mine={leereMeldungen({ tickets: [offen] })} route="d" appContext="pwa" />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /Meine Meldungen/ }))
    expect(screen.queryByText(/Noch keine Antwort/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Passt nicht' })).toBeNull()
  })
})

describe('HelpBubble — Abzeichen', () => {
  it('zählt wartende Antworten am FAB', async () => {
    fetchMySupportTickets.mockResolvedValue({ tickets: [BEANTWORTET], unread: 2 })
    render(<HelpBubble showHelp={false} showSupport />)
    const fab = await screen.findByRole('button', { expanded: false })
    await waitFor(() => expect(fab.textContent).toContain('2'))
  })

  it('bleibt ohne wartende Antwort unbeschriftet', async () => {
    render(<HelpBubble showHelp={false} showSupport />)
    await waitFor(() => expect(fetchMySupportTickets).toHaveBeenCalled())
    const fab = screen.getByRole('button', { expanded: false })
    expect(fab.textContent).toBe('')
  })

  it('fragt gar nicht erst, wenn der Mandant kein Support-Modul hat', async () => {
    render(<HelpBubble showHelp showSupport={false} />)
    await waitFor(() => expect(screen.queryByRole('button', { expanded: false })).not.toBeNull())
    expect(fetchMySupportTickets).not.toHaveBeenCalled()
  })
})
