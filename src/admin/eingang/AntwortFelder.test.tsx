/**
 * Antwort an den Absender — docs/specs/mail-eingang-aufgaben-antworten.md §5.4, §5.5.
 * Gemockt ist, was ans Netz geht.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EingangVorschlag } from '../../api/admin/mailEingang'
import { ApiError } from '../../api/client'

const acceptMailVorschlag = vi.fn()
const sendMailAntwort = vi.fn()
vi.mock('../../api/admin/mailEingang', () => ({
  acceptMailVorschlag: (...a: unknown[]) => acceptMailVorschlag(...a),
  rejectMailVorschlag: vi.fn(),
  searchMailEingangProjekte: vi.fn().mockResolvedValue([]),
  sendMailAntwort: (...a: unknown[]) => sendMailAntwort(...a),
}))

import VorschlagKarte from './VorschlagKarte'

const TEXT = 'Guten Tag Eva Meier\n\nVielen Dank für Ihre Anfrage «Storen ersetzen».\n\nFreundliche Grüsse\nGehlhaar GmbH'
const ANTWORT: EingangVorschlag = {
  id: 's-aw', typ: 'antwort', status: 'offen', created: null, decided_by_name: null, decided_at: null,
  payload: {
    art: 'eingang_bestaetigt', art_label: 'Eingang bestätigt', an: 'eva@meier.ch', betreff: 'AW: Storen',
    text: TEXT, fehlend: [], an_bekannt: false,
  },
}
const GESENDET = {
  suggestion: { ...ANTWORT, status: 'uebernommen' as const, created: { type: 'antwort_gesendet', id: '' },
                decided_by_name: 'Petra', decided_at: '2026-11-13T10:00:00Z' },
  item_status: 'erledigt' as const,
  kopie_ok: true,
}

beforeEach(() => {
  acceptMailVorschlag.mockReset().mockResolvedValue({
    suggestion: { ...ANTWORT, status: 'uebernommen', created: { type: 'antwort_verwendet', id: '' } },
    item_status: 'erledigt',
  })
  sendMailAntwort.mockReset().mockResolvedValue(GESENDET)
})

function karte(props: { senden?: boolean; vorschlag?: EingangVorschlag } = {}) {
  const onEntschieden = vi.fn()
  const onFehler = vi.fn()
  render(<VorschlagKarte itemId="m1" vorschlag={props.vorschlag ?? ANTWORT} onEntschieden={onEntschieden}
                         onFehler={onFehler} antwortenSenden={props.senden ?? false} />)
  return { k: screen.getByTestId(`vorschlag-${(props.vorschlag ?? ANTWORT).id}`), onEntschieden, onFehler }
}

describe('Antwort zum Kopieren (B1)', () => {
  it('zeigt Empfänger, Betreff und Text und sendet nichts', () => {
    const { k } = karte()
    expect(within(k).getByText('eva@meier.ch')).toBeInTheDocument()
    expect(within(k).getByText('Adresse nur aus der weitergeleiteten Mail gelesen.')).toBeInTheDocument()
    expect(within(k).getByLabelText('Betreff')).toHaveValue('AW: Storen')
    expect(within(k).getByLabelText('Text')).toHaveValue(TEXT)
    expect(within(k).queryByRole('button', { name: 'Senden…' })).toBeNull()
    expect(sendMailAntwort).not.toHaveBeenCalled()
  })

  it('kopiert den bearbeiteten Text und öffnet das Mailprogramm mit Empfänger und Betreff', async () => {
    const user = userEvent.setup()
    const schreiben = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { k } = karte()
    await user.type(within(k).getByLabelText('Text'), ' Bis bald.')
    await user.click(within(k).getByRole('button', { name: 'Text kopieren' }))
    expect(schreiben).toHaveBeenCalledWith(`${TEXT} Bis bald.`)
    expect(await within(k).findByText(/Kopiert/)).toBeInTheDocument()
    const link = within(k).getByRole('link', { name: 'Im Mailprogramm öffnen' })
    expect(link.getAttribute('href')).toMatch(/^mailto:eva%40meier\.ch\?subject=AW%3A%20Storen&body=/)
  })

  it('markiert die Antwort als erledigt und schickt nur Änderungen', async () => {
    const user = userEvent.setup()
    const { k, onEntschieden } = karte()
    const betreff = within(k).getByLabelText('Betreff')
    await user.clear(betreff)
    await user.type(betreff, 'AW: Storen Balkon')
    await user.click(within(k).getByRole('button', { name: 'Als erledigt markieren' }))
    await waitFor(() => expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-aw', { betreff: 'AW: Storen Balkon' }))
    expect(onEntschieden).toHaveBeenCalled()
  })
})

describe('Antwort senden (B2, Beta)', () => {
  it('zeigt im Dialog, was hinausgeht, und verlangt bei fremder Adresse ein zweites Ja', async () => {
    const user = userEvent.setup()
    const { k, onEntschieden } = karte({ senden: true })
    await user.click(within(k).getByRole('button', { name: 'Senden…' }))
    const dialog = screen.getByRole('dialog', { name: 'Antwort senden' })
    expect(within(dialog).getByText('eva@meier.ch')).toBeInTheDocument()
    expect(within(dialog).getByText('AW: Storen')).toBeInTheDocument()
    const senden = within(dialog).getByRole('button', { name: 'Jetzt senden' })
    expect(senden).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(senden)
    await waitFor(() => expect(sendMailAntwort).toHaveBeenCalledWith(
      'm1', 's-aw', { betreff: 'AW: Storen', text: TEXT }, true))
    expect(onEntschieden).toHaveBeenCalledWith(GESENDET, 'accept')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sendet eine Adresse aus dem Kundenstamm ohne Rückfrage', async () => {
    const user = userEvent.setup()
    const { k } = karte({ senden: true, vorschlag: { ...ANTWORT, payload: { ...ANTWORT.payload, an_bekannt: true } } })
    expect(within(k).getByText('Die Adresse steht im Kundenstamm.')).toBeInTheDocument()
    await user.click(within(k).getByRole('button', { name: 'Senden…' }))
    const dialog = screen.getByRole('dialog', { name: 'Antwort senden' })
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Jetzt senden' }))
    await waitFor(() => expect(sendMailAntwort).toHaveBeenCalledWith('m1', 's-aw', expect.anything(), false))
  })

  it('zeigt einen Grund des Servers im Dialog und lässt ihn offen', async () => {
    const user = userEvent.setup()
    sendMailAntwort.mockRejectedValue(new ApiError(429, 'An diese Adresse gingen heute schon 3 Antworten.'))
    const { k } = karte({ senden: true, vorschlag: { ...ANTWORT, payload: { ...ANTWORT.payload, an_bekannt: true } } })
    await user.click(within(k).getByRole('button', { name: 'Senden…' }))
    const dialog = screen.getByRole('dialog', { name: 'Antwort senden' })
    await user.click(within(dialog).getByRole('button', { name: 'Jetzt senden' }))
    expect(await within(dialog).findByText('An diese Adresse gingen heute schon 3 Antworten.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Jetzt senden' })).toBeEnabled()
  })

  it('übergibt «nicht mehr offen» dem Screen und schliesst den Dialog', async () => {
    const user = userEvent.setup()
    sendMailAntwort.mockRejectedValue(new ApiError(409, 'nicht_mehr_offen'))
    const { k, onFehler } = karte({ senden: true, vorschlag: { ...ANTWORT, payload: { ...ANTWORT.payload, an_bekannt: true } } })
    await user.click(within(k).getByRole('button', { name: 'Senden…' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jetzt senden' }))
    await waitFor(() => expect(onFehler).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zeigt nach dem Senden, an wen es ging', () => {
    render(<VorschlagKarte itemId="m1" vorschlag={GESENDET.suggestion} onEntschieden={vi.fn()} onFehler={vi.fn()} />)
    expect(screen.getByText('Aus Werkora gesendet an eva@meier.ch.')).toBeInTheDocument()
  })
})
