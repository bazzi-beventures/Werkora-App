import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReorderDrafts from './ReorderDrafts'
import {
  discardReorderDraft, generateReorderDrafts, listReorderDrafts, sendReorderDraft,
} from '../../api/admin/inventory'
import type { ReorderDraft } from '../../api/admin/inventory'

// Spec docs/specs/lager-bestandsfuehrung.md §3 (E3), §6.5.
//
// Die Regel, die diese Datei festhält: Bestellt wird nie automatisch. Der
// Nachtlauf legt einen Entwurf ab, senden tut ein Mensch — und ohne
// hinterlegte Lieferantenadresse geht gar nichts raus, statt still zu
// scheitern.

vi.mock('../../api/admin/inventory', () => ({
  listReorderDrafts: vi.fn(),
  generateReorderDrafts: vi.fn(),
  sendReorderDraft: vi.fn(),
  discardReorderDraft: vi.fn(),
  updateReorderDraft: vi.fn(),
}))

const mockListe = vi.mocked(listReorderDrafts)
const mockSenden = vi.mocked(sendReorderDraft)
const mockVerwerfen = vi.mocked(discardReorderDraft)
const mockErzeugen = vi.mocked(generateReorderDrafts)

function entwurf(over: Partial<ReorderDraft> = {}): ReorderDraft {
  return {
    id: 'd1', supplier_id: 'sup-1', status: 'entwurf',
    items: [{ material_id: 'm1', art_nr: 'A-1', name: 'Endkappe', unit: 'Stk', qty: 20, qty_suggested: 20 }],
    subject: 'Bestellung', body: 'Guten Tag\n\nWir bestellen…',
    body_edited: false, to_email: 'v@griesser.ch',
    created_at: '2026-09-19T06:30:00+00:00', sent_at: null, sent_by: null,
    ...over,
  }
}

beforeEach(() => {
  mockListe.mockReset()
  mockSenden.mockReset()
  mockVerwerfen.mockReset()
  mockErzeugen.mockReset()
  mockListe.mockResolvedValue({ rows: [entwurf()] })
})

const namen = { 'sup-1': 'Griesser' }

describe('Bestellvorschläge', () => {
  it('zeigt Lieferant und Positionen', async () => {
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText('Griesser')).toBeInTheDocument())
    expect(screen.getByText(/Endkappe/)).toBeInTheDocument()
    expect(screen.getByText(/20 Stk/)).toBeInTheDocument()
  })

  it('sendet erst auf Klick, nicht beim Laden', async () => {
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText('Griesser')).toBeInTheDocument())
    expect(mockSenden).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'An Lieferant senden' }))
    await waitFor(() => expect(mockSenden).toHaveBeenCalledWith('d1'))
  })

  it('sperrt das Senden ohne hinterlegte Lieferantenadresse', async () => {
    mockListe.mockResolvedValue({ rows: [entwurf({ to_email: null })] })
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText('Griesser')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'An Lieferant senden' })).toBeDisabled()
    expect(screen.getByText(/keine E-Mail-Adresse hinterlegt/)).toBeInTheDocument()
    // «Als gesendet markieren» bleibt der Weg, wenn anders bestellt wurde.
    expect(screen.getByRole('button', { name: 'Als gesendet markieren' })).toBeEnabled()
  })

  it('markiert ohne Mail, wenn anders bestellt wurde', async () => {
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText('Griesser')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Als gesendet markieren' }))
    await waitFor(() => expect(mockSenden).toHaveBeenCalledWith('d1', true))
  })

  it('fragt vor dem Verwerfen nach und nennt die Sperrfrist', async () => {
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText('Griesser')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))

    expect(screen.getByText(/in einer Woche wieder/)).toBeInTheDocument()
    expect(mockVerwerfen).not.toHaveBeenCalled()
  })

  it('nennt Artikel ohne Lieferant beim Namen', async () => {
    mockListe.mockResolvedValue({ rows: [entwurf({ supplier_id: null })] })
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText('Artikel ohne Lieferant')).toBeInTheDocument())
  })

  it('sagt es, wenn nichts vorliegt', async () => {
    mockListe.mockResolvedValue({ rows: [] })
    render(<ReorderDrafts lieferantNamen={namen} />)
    await waitFor(() => expect(screen.getByText(/Kein offener Vorschlag/)).toBeInTheDocument())
  })
})
