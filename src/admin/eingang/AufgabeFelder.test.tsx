/**
 * Aufgabe aus dem Mail-Eingang — docs/specs/mail-eingang-aufgaben-antworten.md §4.3.
 * Gemockt ist, was ans Netz geht; geschrieben wird erst mit «Übernehmen».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EingangVorschlag } from '../../api/admin/mailEingang'

const acceptMailVorschlag = vi.fn()
const getEingangZustaendige = vi.fn()
vi.mock('../../api/admin/mailEingang', () => ({
  acceptMailVorschlag: (...a: unknown[]) => acceptMailVorschlag(...a),
  rejectMailVorschlag: vi.fn(),
  searchMailEingangProjekte: vi.fn().mockResolvedValue([]),
  getEingangZustaendige: () => getEingangZustaendige(),
}))

import VorschlagKarte from './VorschlagKarte'

const P1 = { project_id: 'p1', number: '2600515', name: 'Storen Meier', customer: 'Meier', locality: 'Uster' }
const VORSCHLAG: EingangVorschlag = {
  id: 's-aufg', typ: 'aufgabe', status: 'offen', created: null, decided_by_name: null, decided_at: null,
  payload: {
    title: 'Masse an Frau Meier schicken', description: '', due_date: '2026-11-20', project_id: 'p1',
    projects: [P1], beleg: 'bis Freitag, 20.11. die Masse schicken',
  },
}

beforeEach(() => {
  acceptMailVorschlag.mockReset().mockResolvedValue({
    suggestion: { ...VORSCHLAG, status: 'uebernommen', decided_by_name: 'Petra', decided_at: '2026-11-13T10:00:00Z' },
    item_status: 'erledigt',
  })
  getEingangZustaendige.mockReset().mockResolvedValue([{ id: 's9', name: 'Anna Keller' }])
})

function karte(onNav = vi.fn()) {
  const onEntschieden = vi.fn()
  render(<VorschlagKarte itemId="m1" vorschlag={VORSCHLAG} onEntschieden={onEntschieden} onFehler={vi.fn()} onNav={onNav} />)
  return { k: screen.getByTestId('vorschlag-s-aufg'), onEntschieden }
}

describe('Aufgabe aufs Board', () => {
  it('zeigt Vorschlag und Beleg, schreibt aber nichts', async () => {
    const { k } = karte()
    expect(within(k).getByLabelText('Titel')).toHaveValue('Masse an Frau Meier schicken')
    expect(within(k).getByLabelText('Fällig am')).toHaveValue('2026-11-20')
    expect(within(k).getByLabelText('Zuständig')).toHaveValue('auto')
    expect(within(k).getByText('Aus der Mail: «bis Freitag, 20.11. die Masse schicken»')).toBeInTheDocument()
    await within(k).findByRole('option', { name: 'Anna Keller' })
    expect(acceptMailVorschlag).not.toHaveBeenCalled()
  })

  it('übernimmt mit gewählter Person und ohne Projekt — nur die Änderungen', async () => {
    const user = userEvent.setup()
    const { k, onEntschieden } = karte()
    await within(k).findByRole('option', { name: 'Anna Keller' })
    await user.selectOptions(within(k).getByLabelText('Zuständig'), 's9')
    await user.click(within(k).getByRole('button', { name: 'Ohne Projekt' }))
    await user.click(within(k).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-aufg', { project_id: '', assignee: 's9' }))
    expect(onEntschieden).toHaveBeenCalled()
  })

  it('ohne Titel bleibt «Übernehmen» gesperrt', async () => {
    const user = userEvent.setup()
    const { k } = karte()
    await user.clear(within(k).getByLabelText('Titel'))
    expect(within(k).getByRole('button', { name: 'Übernehmen' })).toBeDisabled()
    expect(within(k).getByText('Die Aufgabe braucht einen Titel.')).toBeInTheDocument()
  })

  it('bleibt bedienbar, wenn die Mitarbeitenden nicht laden', async () => {
    getEingangZustaendige.mockRejectedValue(new Error('netz'))
    const { k } = karte()
    expect(await within(k).findByText('Die Mitarbeitenden liessen sich nicht laden.')).toBeInTheDocument()
    expect(within(k).getByRole('button', { name: 'Übernehmen' })).toBeEnabled()
  })

  it('führt nach dem Übernehmen zum Aufgaben-Board', async () => {
    const onNav = vi.fn()
    render(<VorschlagKarte itemId="m1" vorschlag={{ ...VORSCHLAG, status: 'uebernommen' }}
                           onEntschieden={vi.fn()} onFehler={vi.fn()} onNav={onNav} />)
    expect(screen.getByText('Liegt auf dem Aufgaben-Board.')).toBeInTheDocument()
    expect(screen.getByText('20.11.2026')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Zum Aufgaben-Board' }))
    expect(onNav).toHaveBeenCalledWith('tasks')
  })
})
