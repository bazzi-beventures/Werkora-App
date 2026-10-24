/**
 * «Lieferschein-Eingang» des Büros — docs/specs/lieferschein-erfassung.md §3.3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LieferscheinEintrag } from '../../api/lieferscheine'

const listLieferscheinEingang = vi.fn()
const assignLieferschein = vi.fn()
const verwerfeLieferschein = vi.fn()
vi.mock('../../api/lieferscheine', () => ({
  listLieferscheinEingang: () => listLieferscheinEingang(),
  assignLieferschein: (...a: unknown[]) => assignLieferschein(...a),
  verwerfeLieferschein: (id: string) => verwerfeLieferschein(id),
  searchLieferscheinProjekte: vi.fn().mockResolvedValue([]),
  lieferscheinBildUrl: (id: string) => `/pwa/lieferscheine/${id}/image`,
}))

import DeliveryNotesScreen from './DeliveryNotesScreen'

function eintrag(over: Partial<LieferscheinEintrag> = {}): LieferscheinEintrag {
  return {
    id: 'e1', status: 'offen', created_at: '2026-10-24T07:00:00Z', filename: 'a.jpg', mime_type: 'image/jpeg',
    uploaded_by_name: 'Lea Lager', assigned_project: null, assigned_at: null, assigned_by_name: null,
    candidates: [{ project_id: 'p1', number: '2600515', name: 'Bad Muster', customer: 'Muster', locality: 'Chur' }],
    ...over,
  }
}

beforeEach(() => {
  listLieferscheinEingang.mockReset().mockResolvedValue([eintrag()])
  assignLieferschein.mockReset().mockResolvedValue({ status: 'ok' })
  verwerfeLieferschein.mockReset().mockResolvedValue(undefined)
})

describe('DeliveryNotesScreen', () => {
  it('zeigt Bild, Fotograf und den Vorschlag — ein Klick legt ihn ab', async () => {
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<DeliveryNotesScreen onChanged={onChanged} />)
    expect(await screen.findByText('Lea Lager')).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('src')).toBe('/pwa/lieferscheine/e1/image')
    await user.click(screen.getByRole('button', { name: /2600515 Bad Muster/ }))
    expect(assignLieferschein).toHaveBeenCalledWith('e1', 'p1')
    await waitFor(() => expect(screen.getByText(/kein Lieferschein wartet/)).toBeTruthy())
    expect(onChanged).toHaveBeenCalled()
  })

  it('verwirft erst nach Rückfrage', async () => {
    const user = userEvent.setup()
    render(<DeliveryNotesScreen />)
    await user.click(await screen.findByRole('button', { name: 'Verwerfen' }))
    expect(verwerfeLieferschein).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Ja, verwerfen' }))
    expect(verwerfeLieferschein).toHaveBeenCalledWith('e1')
  })

  it('leerer Eingang', async () => {
    listLieferscheinEingang.mockResolvedValue([])
    render(<DeliveryNotesScreen />)
    expect(await screen.findByText(/kein Lieferschein wartet/)).toBeTruthy()
  })
})
