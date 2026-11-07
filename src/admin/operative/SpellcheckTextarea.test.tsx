import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { SpellcheckTextarea } from './SpellcheckTextarea'
import { checkSpelling, composeQuoteDescription } from '../../api/admin/spellcheck'

vi.mock('../../api/admin/spellcheck', () => ({
  checkSpelling: vi.fn(),
  composeQuoteDescription: vi.fn(),
}))

const PLATZHALTER = 'Beschreibung der angebotenen Produkte…'

// Die Produktbeschreibung der Offerte (WS-37): formatierbarer Editor, «Beschreibung
// formulieren» schickt das Projekt mit und zeigt den Vorschlag so, wie das PDF ihn druckt.
describe('SpellcheckTextarea — formatierbar (rich)', () => {
  beforeEach(() => {
    vi.mocked(composeQuoteDescription).mockReset()
    vi.mocked(checkSpelling).mockReset()
  })

  it('ist ein Editor mit Fett-Knopf statt eines Textfelds', () => {
    render(<SpellcheckTextarea value="" onChange={() => {}} placeholder={PLATZHALTER} compose rich />)
    expect(screen.getByTitle('Bold')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLATZHALTER).tagName).not.toBe('TEXTAREA')
  })

  it('schickt das Projekt mit und zeigt Titel fett und Aufzählung als Liste', async () => {
    vi.mocked(composeQuoteDescription).mockResolvedValue({
      description: '**Lieferumfang**\n- Lamellendach STOBAG BAVONA TP6800\n- Montage nach Mass',
      changed: true,
    })
    const onChange = vi.fn()
    render(
      <SpellcheckTextarea
        value="Lamellendach Bavona TP6800 neu"
        onChange={onChange}
        placeholder={PLATZHALTER}
        compose
        rich
        projectId="p-1"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Beschreibung formulieren/ }))

    const vorschlag = await screen.findByTestId('suggestion')
    expect(composeQuoteDescription).toHaveBeenCalledWith('Lamellendach Bavona TP6800 neu', 'p-1')
    expect(within(vorschlag).getByText('Lieferumfang').tagName).toBe('STRONG')
    expect(within(vorschlag).getAllByRole('listitem')).toHaveLength(2)
    expect(vorschlag.textContent).not.toContain('**')

    // Übernommen wird der Markdown-Text, nicht die Darstellung.
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(onChange).toHaveBeenCalledWith(
      '**Lieferumfang**\n- Lamellendach STOBAG BAVONA TP6800\n- Montage nach Mass',
    )
  })

  it('zeigt in der Rechtschreibprüfung keine Sternchen', async () => {
    vi.mocked(checkSpelling).mockResolvedValue({ corrected: '**Lamellen** Storen', changed: true })
    render(<SpellcheckTextarea value="**Lammelen** Storen" onChange={() => {}} placeholder={PLATZHALTER} rich />)

    fireEvent.click(screen.getByRole('button', { name: /Rechtschreibung prüfen/ }))

    const vorschlag = await screen.findByTestId('suggestion')
    await waitFor(() => expect(vorschlag.textContent).toBe('Lamellen Storen'))
  })
})

describe('SpellcheckTextarea — Klartext (Standard)', () => {
  it('bleibt ein Textfeld und schickt ohne Projekt nichts mit', async () => {
    vi.mocked(composeQuoteDescription).mockResolvedValue({ description: 'Wir offerieren Ihnen …', changed: true })
    render(<SpellcheckTextarea value="Stichworte" onChange={() => {}} placeholder="x" compose />)
    expect(screen.getByPlaceholderText('x').tagName).toBe('TEXTAREA')

    fireEvent.click(screen.getByRole('button', { name: /Beschreibung formulieren/ }))
    await screen.findByTestId('suggestion')
    expect(composeQuoteDescription).toHaveBeenCalledWith('Stichworte', undefined)
  })
})
