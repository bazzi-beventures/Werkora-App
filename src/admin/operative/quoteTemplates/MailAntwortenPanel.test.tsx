/** Vorlagen → Mail-Antworten — docs/specs/mail-eingang-aufgaben-antworten.md §5.3. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getAntwortVorlagen = vi.fn()
const saveAntwortVorlage = vi.fn()
const resetAntwortVorlage = vi.fn()
vi.mock('../../../api/admin/mailEingang', () => ({
  getAntwortVorlagen: () => getAntwortVorlagen(),
  saveAntwortVorlage: (...a: unknown[]) => saveAntwortVorlage(...a),
  resetAntwortVorlage: (...a: unknown[]) => resetAntwortVorlage(...a),
}))

import { MailAntwortenPanel } from './MailAntwortenPanel'

const vorlage = (art: string, label: string, standard = true, zusatz: string[] = []) => ({
  art, label, text: `{anrede}\n\n${label}\n\n{firma}`, zusatz, standard, updated_at: null, updated_by_name: null,
})

beforeEach(() => {
  getAntwortVorlagen.mockReset().mockResolvedValue({
    vorlagen: [vorlage('eingang_bestaetigt', 'Eingang bestätigt'),
               vorlage('angaben_fehlen', 'Angaben fehlen', false, ['Foto der Fenster'])],
    platzhalter: { anrede: 'Anrede', firma: 'Firma' },
  })
  saveAntwortVorlage.mockReset().mockResolvedValue(undefined)
  resetAntwortVorlage.mockReset().mockResolvedValue(undefined)
})

describe('Mail-Antworten', () => {
  it('speichert eine angepasste Vorlage mit den Zusatzangaben', async () => {
    const user = userEvent.setup()
    render(<MailAntwortenPanel />)
    const karte = await screen.findByRole('region', { name: 'Angaben fehlen' })
    const zusatz = within(karte).getByPlaceholderText(/Masse oder Foto/)
    await user.type(zusatz, '\nPlan des Grundrisses')
    await user.click(within(karte).getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(saveAntwortVorlage).toHaveBeenCalledWith(
      'angaben_fehlen', '{anrede}\n\nAngaben fehlen\n\n{firma}', ['Foto der Fenster', 'Plan des Grundrisses']))
  })

  it('zeigt Zusatzangaben nur bei «Angaben fehlen» und setzt Angepasstes zurück', async () => {
    const user = userEvent.setup()
    render(<MailAntwortenPanel />)
    const eingang = await screen.findByRole('region', { name: 'Eingang bestätigt' })
    expect(within(eingang).queryByPlaceholderText(/Masse oder Foto/)).toBeNull()
    expect(within(eingang).getByRole('button', { name: 'Speichern' })).toBeDisabled()
    expect(within(eingang).queryByRole('button', { name: 'Standardtext wiederherstellen' })).toBeNull()
    const angaben = screen.getByRole('region', { name: 'Angaben fehlen' })
    await user.click(within(angaben).getByRole('button', { name: 'Standardtext wiederherstellen' }))
    await waitFor(() => expect(resetAntwortVorlage).toHaveBeenCalledWith('angaben_fehlen'))
  })
})
