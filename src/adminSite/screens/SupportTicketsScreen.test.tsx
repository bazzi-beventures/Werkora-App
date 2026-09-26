/**
 * Antwort an den Melder im Support-Eingang (docs/specs/support-antwort.md §5).
 *
 * Zwei Dinge sind hier prüfenswert, und beide sind Regeln, keine Optik:
 *
 * 1. **Der Statuswechsel verschickt nichts** (A3). Er füllt nur das Antwortfeld
 *    vor. Wer das aufweicht, verschickt ein inhaltsleeres «Ihre Meldung ist
 *    erledigt» — bei jeder Doppelmeldung und jeder Bedienfrage.
 * 2. **Antwort und interne Notiz sind zwei Felder** (A2). Ein gemeinsames Feld
 *    ist die Stelle, an der irgendwann eine interne Bemerkung beim Monteur
 *    landet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const fetchSupportDashboard = vi.fn()
const fetchSupportTickets = vi.fn()
const fetchSupportTicket = vi.fn()
const updateSupportTicket = vi.fn()
const sendSupportReply = vi.fn()

vi.mock('../../api/support', () => ({
  fetchSupportDashboard: () => fetchSupportDashboard(),
  fetchSupportTickets: (p: unknown) => fetchSupportTickets(p),
  fetchSupportTicket: (id: string) => fetchSupportTicket(id),
  updateSupportTicket: (id: string, body: unknown) => updateSupportTicket(id, body),
  sendSupportReply: (id: string, text: string) => sendSupportReply(id, text),
}))

const supportTicketToFeatureRequest = vi.fn()
vi.mock('../../api/featureRequests', () => ({
  supportTicketToFeatureRequest: (id: string) => supportTicketToFeatureRequest(id),
}))

import SupportTicketsScreen from './SupportTicketsScreen'

const TICKET = {
  id: 'tk-1',
  ticket_no: 1042,
  reference: 'WS-1042',
  tenant_id: 't-1',
  tenant_name: 'Muster Bau AG',
  message: 'Rapport speichert nicht',
  status: 'offen' as const,
  created_at: '2026-09-18T08:00:00Z',
  snapshot_error_count: 0,
  attachment_count: 0,
}

const DETAIL = {
  ...TICKET,
  snapshot: { client: {} },
  attachments: [],
  replies: [],
  reply_read_at: null,
}

async function oeffneDetail() {
  render(<SupportTicketsScreen />)
  const zeile = await screen.findByTitle('Meldung öffnen')
  fireEvent.click(zeile)
  await screen.findByText('Antwort an den Melder')
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchSupportDashboard.mockResolvedValue({
    counts: { offen: 1, in_arbeit: 0, erledigt: 0 },
    open_total: 1, new_7d: 1, new_prev_7d: 0,
    median_hours_30d: null, error_share_30d: null, total_30d: 1,
    window_days: 90, by_week: [], by_tenant: [], by_context: [], by_route: [], by_source: [],
  })
  fetchSupportTickets.mockResolvedValue({ tickets: [TICKET], tenants: [], capped: false })
  fetchSupportTicket.mockResolvedValue({ ...DETAIL })
  updateSupportTicket.mockResolvedValue({})
  sendSupportReply.mockResolvedValue({
    ok: true,
    replies: [{ text: 'Behoben.', at: '2026-09-19T08:00:00Z', by: 'Luca' }],
    last_reply_at: '2026-09-19T08:00:00Z',
  })
})

describe('SupportTicketsScreen — Antwort an den Melder', () => {
  it('sendet erst auf Knopfdruck und leert danach das Feld', async () => {
    await oeffneDetail()
    const feld = screen.getByPlaceholderText(/Was der Melder lesen soll/) as HTMLTextAreaElement
    fireEvent.change(feld, { target: { value: 'Behoben, bitte App neu laden.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    await waitFor(() => expect(sendSupportReply).toHaveBeenCalledWith(
      'tk-1', 'Behoben, bitte App neu laden.'))
    await waitFor(() => expect(feld.value).toBe(''))
    // Die gesendete Antwort steht danach im Verlauf.
    expect(screen.queryByText('Behoben.')).not.toBeNull()
  })

  it('schickt nichts ab, solange das Feld leer ist', async () => {
    await oeffneDetail()
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toBeDisabled()
  })

  it('der Statuswechsel auf «Erledigt» benachrichtigt niemanden', async () => {
    await oeffneDetail()
    // Genauer Name: «Erledigt» steht auch als Filter-Chip über der Liste.
    fireEvent.click(screen.getByRole('button', { name: '→ Erledigt' }))
    await waitFor(() => expect(updateSupportTicket).toHaveBeenCalled())
    // Ratchet zu A3: kein Automatismus. Es wird nur der Vorschlagstext
    // eingesetzt — abschicken muss ihn ein Mensch.
    expect(sendSupportReply).not.toHaveBeenCalled()
    const feld = screen.getByPlaceholderText(/Was der Melder lesen soll/) as HTMLTextAreaElement
    expect(feld.value).toBe('Das Problem ist behoben.')
  })

  it('trennt die interne Notiz sichtbar von der Antwort', async () => {
    await oeffneDetail()
    // Zwei Felder, zwei Empfänger — und die Beschriftung sagt, welches welches ist.
    expect(screen.queryByText('Notiz (intern)')).not.toBeNull()
    expect(screen.queryByPlaceholderText(/Melder sieht sie nicht/)).not.toBeNull()
  })

  it('sagt bei einer frischen Antwort, dass sie noch nicht gelesen wurde', async () => {
    // Eine ältere Quittung darf nicht unter eine NEUE Antwort rutschen: der
    // Server leert `reply_read_at` beim Senden.
    fetchSupportTicket.mockResolvedValue({
      ...DETAIL,
      replies: [{ text: 'Zwischenstand.', at: '2026-09-18T09:00:00Z', by: 'Luca' }],
      reply_read_at: '2026-09-18T10:00:00Z',
    })
    await oeffneDetail()
    expect(screen.queryByText(/gelesen am/)).not.toBeNull()

    fireEvent.change(screen.getByPlaceholderText(/Was der Melder lesen soll/),
                     { target: { value: 'Jetzt behoben.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    await waitFor(() => expect(screen.queryByText(/noch nicht gelesen/)).not.toBeNull())
    expect(screen.queryByText(/gelesen am/)).toBeNull()
  })
})

describe('SupportTicketsScreen — Weiche Support → Wunsch (feature-anfragen §7.3)', () => {
  it('«Ist ein Wunsch» übernimmt, schliesst und belegt die Antwort nur vor', async () => {
    supportTicketToFeatureRequest.mockResolvedValue({
      id: 'r-9', reference: 'WW-2001',
      reply_suggestion: 'Das nehmen wir als Wunsch auf: WW-2001.',
    })
    await oeffneDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Ist ein Wunsch' }))
    await waitFor(() => expect(supportTicketToFeatureRequest).toHaveBeenCalledWith('tk-1'))
    const feld = screen.getByPlaceholderText(/Was der Melder lesen soll/) as HTMLTextAreaElement
    await waitFor(() => expect(feld.value).toBe('Das nehmen wir als Wunsch auf: WW-2001.'))
    // Wie beim Abschliessen (A3): vorbelegt, nicht verschickt.
    expect(sendSupportReply).not.toHaveBeenCalled()
    const notiz = screen.getByPlaceholderText(/Melder sieht sie nicht/) as HTMLInputElement
    expect(notiz.value).toBe('→ WW-2001')
    expect(screen.getByRole('button', { name: 'Ist ein Wunsch' })).toBeDisabled()
  })
})

// ── Posteingang — docs/specs/support-uebersicht.md ─────────────────────────

const DASH = {
  counts: { offen: 1, in_arbeit: 0, erledigt: 1 },
  open_total: 1, new_7d: 2, new_prev_7d: 0,
  median_hours_30d: null, error_share_30d: null, total_30d: 2,
  window_days: 90, by_week: [], by_tenant: [], by_context: [], by_route: [], by_source: [],
  oldest_open_at: '2026-09-18T08:00:00Z',
  clusters: [],
}

describe('SupportTicketsScreen — Posteingang', () => {
  beforeEach(() => {
    fetchSupportDashboard.mockResolvedValue({ ...DASH })
    fetchSupportTickets.mockResolvedValue({
      tickets: [
        TICKET,
        { ...TICKET, id: 'tk-2', reference: 'WS-1043', message: 'Längst erledigt',
          status: 'erledigt', created_at: '2026-09-19T08:00:00Z' },
      ],
      tenants: [], capped: false,
    })
  })

  it('zeigt beim Öffnen nur, was zu erledigen ist', async () => {
    render(<SupportTicketsScreen />)
    await screen.findByText('Rapport speichert nicht')
    expect(screen.queryByText('Längst erledigt')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Erledigt/ }))
    expect(await screen.findByText('Längst erledigt')).toBeTruthy()
  })

  it('nennt in der Statuszeile, wie viel offen ist und wie lange die älteste wartet', async () => {
    render(<SupportTicketsScreen />)
    expect(await screen.findByText('1 zu erledigen')).toBeTruthy()
    expect(screen.getByText(/älteste wartet/)).toBeTruthy()
  })

  it('markiert nie Geöffnetes und nimmt den Punkt beim Öffnen weg', async () => {
    fetchSupportTickets.mockResolvedValue({
      tickets: [{ ...TICKET, seen_at: null }], tenants: [], capped: false,
    })
    fetchSupportTicket.mockResolvedValue({ ...DETAIL, seen_at: '2026-09-25T10:00:00Z' })
    render(<SupportTicketsScreen />)
    expect(await screen.findByLabelText('ungelesen')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Meldung öffnen'))
    await screen.findByText('Antwort an den Melder')
    await waitFor(() => expect(screen.queryByLabelText('ungelesen')).toBeNull())
  })

  it('öffnet eine per Link übergebene Meldung direkt', async () => {
    render(<SupportTicketsScreen initialTicketId="tk-1" />)
    await screen.findByText('Antwort an den Melder')
    expect(fetchSupportTicket).toHaveBeenCalledWith('tk-1')
  })

  it('meldet eine Häufung und filtert auf Klick darauf', async () => {
    fetchSupportDashboard.mockResolvedValue({
      ...DASH,
      clusters: [{ kind: 'route', key: 'projekte', count: 3, since: '2026-09-25T07:12:00Z' }],
    })
    fetchSupportTickets.mockResolvedValue({
      tickets: [
        { ...TICKET, route: 'rapport', app_context: 'pwa' },
        { ...TICKET, id: 'tk-3', message: 'Projektliste leer', route: 'projekte', app_context: 'pwa' },
      ],
      tenants: [], capped: false,
    })
    render(<SupportTicketsScreen />)
    const banner = await screen.findByRole('button', { name: /Häufung: 3 offene Meldungen von «Projekte»/ })
    fireEvent.click(banner)
    await waitFor(() => expect(screen.queryByText('Rapport speichert nicht')).toBeNull())
    expect(screen.getByText('Projektliste leer')).toBeTruthy()
  })

  it('Auswertung: keine Diagramme bei zu wenig Daten, sondern ein Satz', async () => {
    render(<SupportTicketsScreen />)
    await screen.findByText('1 zu erledigen')
    fireEvent.click(screen.getByRole('button', { name: 'Auswertung' }))
    expect(await screen.findByText(/Diagramme erscheinen, sobald/)).toBeTruthy()
    expect(screen.getAllByText('zu wenig Daten').length).toBe(2)
  })
})
