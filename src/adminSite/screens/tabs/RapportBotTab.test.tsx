import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getRapportBotPrompt = vi.fn()
const setRapportBotPrompt = vi.fn()
vi.mock('../../tenantScopedApi', () => ({
  getRapportBotPrompt: (id: string) => getRapportBotPrompt(id),
  setRapportBotPrompt: (id: string, t: string) => setRapportBotPrompt(id, t),
}))

import { RapportBotTab } from './RapportBotTab'

// Fachgebiet des Rapport-Bots (docs/specs/rapport-bot-guardrails.md §4.8): pflegt der
// Betreiber je Mandant — gelesen und geschrieben wird beim Mandanten aus dem Wähler.
describe('RapportBotTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRapportBotPrompt.mockResolvedValue({ text: 'Storenfirma', max_zeichen: 4000 })
    setRapportBotPrompt.mockImplementation(async (_id: string, text: string) => ({ text: text.trim(), max_zeichen: 4000 }))
  })

  it('lädt und speichert beim Mandanten aus dem Wähler', async () => {
    render(<RapportBotTab tenantId="t-gehlhaar" />)
    const feld = await screen.findByLabelText('Fachgebiet des Betriebs')
    expect(getRapportBotPrompt).toHaveBeenCalledWith('t-gehlhaar')
    expect(feld).toHaveValue('Storenfirma')
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()

    await userEvent.type(feld, ' und Markisen')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(setRapportBotPrompt).toHaveBeenCalledWith('t-gehlhaar', 'Storenfirma und Markisen'))
    expect(screen.getByText('24 / 4000 Zeichen')).toBeInTheDocument()
  })
})
