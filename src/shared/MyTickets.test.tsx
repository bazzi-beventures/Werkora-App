import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SupportForm from './SupportForm'
import HelpBubble from './HelpBubble'
import MyTickets from './MyTickets'
import { leereMeldungen } from './supportTestFixtures'
import type { MySupportTicket } from '../api/support'

// Spec docs/specs/support-antwort.md §4

const fetchMySupportTickets = vi.fn()
const markSupportRepliesRead = vi.fn()
const sendSupportAddendum = vi.fn()

vi.mock('../api/support', async () => {
  const actual = await vi.importActual<typeof import('../api/support')>('../api/support')
  return {
    ...actual,
    sendSupportTicket: vi.fn(),
    fetchMySupportTickets: (...args: unknown[]) => fetchMySupportTickets(...args),
    markSupportRepliesRead: (...args: unknown[]) => markSupportRepliesRead(...args),
    sendSupportAddendum: (...args: unknown[]) => sendSupportAddendum(...args),
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
  sendSupportAddendum.mockReset()
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

// ── Offene Meldungen ergänzen (Spec support-antwort.md §13) ──────────────────

const OFFEN: MySupportTicket = {
  id: 't2',
  ticket_no: 14,
  reference: 'WS-14',
  message: 'Absenzen lassen sich nicht erfassen',
  status: 'offen',
  created_at: '2026-10-03T08:00:00Z',
  replies: [],
  last_reply_at: null,
  reply_read_at: null,
  addenda: [],
}

describe('MyTickets — offene Meldungen', () => {
  it('stellt offene Meldungen vor erledigte und beschriftet die Gruppen', () => {
    // Server liefert neueste zuerst — hier die erledigte vorne.
    const erledigtNeu = { ...BEANTWORTET, created_at: '2026-10-04T08:00:00Z' }
    render(
      <MyTickets tickets={[erledigtNeu, OFFEN]} loading={false} failed={false}
                 onNewWithReference={() => {}} />,
    )
    const refs = screen.getAllByText(/^WS-\d+$/).map(e => e.textContent)
    expect(refs).toEqual(['WS-14', 'WS-1042'])
    expect(screen.queryByText('Offen (1)')).not.toBeNull()
    expect(screen.queryByText('Erledigt (1)')).not.toBeNull()
  })

  it('erlaubt einen Nachtrag zur offenen Meldung', async () => {
    const onChanged = vi.fn()
    sendSupportAddendum.mockResolvedValue({
      ok: true, status: 'offen',
      addenda: [{ text: 'Nur bei Ferien.', at: '2026-10-05T16:00:00Z' }],
    })
    render(
      <MyTickets tickets={[OFFEN]} loading={false} failed={false}
                 onNewWithReference={() => {}} onChanged={onChanged} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ergänzen' }))
    fireEvent.change(screen.getByLabelText('Nachtrag zu WS-14'), {
      target: { value: 'Nur bei Ferien.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Nachtrag senden' }))
    await waitFor(() => expect(sendSupportAddendum).toHaveBeenCalledWith('t2', { text: 'Nur bei Ferien.' }))
    // Steht sofort da, ohne auf das Neuladen zu warten.
    expect(await screen.findByText('Nur bei Ferien.')).not.toBeNull()
    expect(onChanged).toHaveBeenCalled()
  })

  it('«Hat sich erledigt» schliesst die Meldung — Text freiwillig', async () => {
    sendSupportAddendum.mockResolvedValue({
      ok: true, status: 'erledigt',
      addenda: [{ text: 'Hat sich erledigt.', at: '2026-10-05T16:00:00Z', resolved: true }],
    })
    render(
      <MyTickets tickets={[OFFEN]} loading={false} failed={false}
                 onNewWithReference={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hat sich erledigt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Als erledigt melden' }))
    await waitFor(() =>
      expect(sendSupportAddendum).toHaveBeenCalledWith('t2', { text: '', resolved: true }))
    expect(await screen.findByText('Von dir als erledigt gemeldet', { exact: false })).not.toBeNull()
    // Erledigt: keine Ergänzen-Knöpfe mehr.
    expect(screen.queryByRole('button', { name: 'Ergänzen' })).toBeNull()
  })

  it('ein leerer Nachtrag geht nicht raus', () => {
    render(
      <MyTickets tickets={[OFFEN]} loading={false} failed={false}
                 onNewWithReference={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ergänzen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nachtrag senden' }))
    expect(sendSupportAddendum).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/was du ergänzen/)
  })

  it('erledigte Meldungen bekommen keinen Nachtrag-Knopf', () => {
    render(
      <MyTickets tickets={[BEANTWORTET]} loading={false} failed={false}
                 onNewWithReference={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: 'Ergänzen' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Passt nicht' })).not.toBeNull()
  })
})

describe('SupportForm — Hinweis auf offene Meldungen', () => {
  it('nennt die offene Meldung, bevor eine neue geschrieben wird', () => {
    render(
      <SupportForm mine={leereMeldungen({ tickets: [OFFEN] })} route="d" appContext="admin" />,
    )
    const hinweis = screen.getByRole('button', { name: /WS-14 ist noch offen/ })
    expect(screen.getByRole('tab', { name: /1 offen/ })).not.toBeNull()
    fireEvent.click(hinweis)
    expect(screen.getByRole('button', { name: 'Ergänzen' })).not.toBeNull()
  })

  it('kein Hinweis ohne offene Meldung', () => {
    render(
      <SupportForm mine={leereMeldungen({ tickets: [BEANTWORTET] })} route="d" appContext="pwa" />,
    )
    expect(screen.queryByRole('button', { name: /noch offen/ })).toBeNull()
  })
})
