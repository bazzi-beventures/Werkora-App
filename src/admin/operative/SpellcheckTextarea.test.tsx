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

// Offene Punkte (fehlende Farbe, Zahl, die nicht aus den Stichworten stammt) stehen
// im Popup neben dem Vorschlag — ins Feld kommt nur der Vorschlag selbst.
describe('SpellcheckTextarea — Hinweise zum Vorschlag', () => {
  beforeEach(() => {
    vi.mocked(composeQuoteDescription).mockReset()
    vi.mocked(checkSpelling).mockReset()
  })

  it('zeigt die Hinweise und übernimmt nur den Vorschlag', async () => {
    vi.mocked(composeQuoteDescription).mockResolvedValue({
      description: 'Wir offerieren Ihnen 8 Griesser Lamisol 90.',
      changed: true,
      hints: [
        'Im Vorschlag steht eine Zahl, die in deinen Stichworten nicht vorkommt: 8. Bitte prüfen, bevor du ihn übernimmst.',
        'Farbe nicht angegeben.',
        '   ',
      ],
    })
    const onChange = vi.fn()
    render(<SpellcheckTextarea value="Lamisol 90 neu" onChange={onChange} placeholder="x" compose />)

    fireEvent.click(screen.getByRole('button', { name: /Beschreibung formulieren/ }))

    const kasten = await screen.findByTestId('compose-hints')
    const punkte = within(kasten).getAllByRole('listitem')
    expect(punkte).toHaveLength(2)
    expect(punkte[1].textContent).toBe('Farbe nicht angegeben.')

    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(onChange).toHaveBeenCalledWith('Wir offerieren Ihnen 8 Griesser Lamisol 90.')
  })

  it('zeigt keinen Kasten, wenn es nichts zu prüfen gibt', async () => {
    vi.mocked(composeQuoteDescription).mockResolvedValue({ description: 'Wir offerieren Ihnen …', changed: true })
    render(<SpellcheckTextarea value="Stichworte" onChange={() => {}} placeholder="x" compose />)

    fireEvent.click(screen.getByRole('button', { name: /Beschreibung formulieren/ }))

    await screen.findByTestId('suggestion')
    expect(screen.queryByTestId('compose-hints')).toBeNull()
  })

  it('trägt alte Hinweise nicht in die Rechtschreibprüfung', async () => {
    vi.mocked(composeQuoteDescription).mockResolvedValue({
      description: 'Wir offerieren Ihnen …', changed: true, hints: ['Farbe nicht angegeben.'],
    })
    vi.mocked(checkSpelling).mockResolvedValue({ corrected: 'Lamellen Storen', changed: true })
    render(<SpellcheckTextarea value="Lammelen Storen" onChange={() => {}} placeholder="x" compose />)

    fireEvent.click(screen.getByRole('button', { name: /Beschreibung formulieren/ }))
    await screen.findByTestId('compose-hints')
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))

    fireEvent.click(screen.getByRole('button', { name: /Rechtschreibung prüfen/ }))
    await screen.findByTestId('suggestion')
    expect(screen.queryByTestId('compose-hints')).toBeNull()
  })
})
