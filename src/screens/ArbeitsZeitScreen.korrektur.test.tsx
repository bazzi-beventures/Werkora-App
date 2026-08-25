import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArbeitsZeitScreen from './ArbeitsZeitScreen'

// Zwei Meldungen aus dem Feld (Video vom 19.08.2026):
//   1. Im Pausenfeld stand die vorbelegte 0; der Monteur tippte "695" dahinter
//      und bekam "0695" zu sehen. 695 Min Pause auf 11 h Anwesenheit ergibt bei
//      der Genehmigung 0 Arbeitsminuten (max(0, spanne - pause)) — ohne Hinweis.
//   2. Das Feld liess sich nicht sinnvoll bedienen, weil iOS bei jedem Fokus in
//      die Seite hineinzoomte (Ursache: font-size < 16px, behoben in index.css —
//      dort nicht testbar, jsdom kennt kein Safari-Zoomverhalten).

vi.mock('../api/chat', () => ({
  zeitAction: vi.fn(),
  submitCorrectionRequest: vi.fn(),
  getCorrectionStatus: vi.fn(),
}))

function openForm() {
  render(
    <ArbeitsZeitScreen
      displayName="Kevin De Florian"
      role="user"
      onNavHome={() => {}}
      onNavRapport={() => {}}
      onNavProjekte={() => {}}
      onNavProfile={() => {}}
      onLoggedOut={() => {}}
      onOpenBericht={() => {}}
      onNavAbsenzen={() => {}}
    />
  )
  fireEvent.click(screen.getByText('Arbeitszeit korrigieren'))
}

const pauseInput = () =>
  screen.getByText('Pause (Min)').parentElement!.querySelector('input') as HTMLInputElement
const timeInput = (label: string) =>
  screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement
const einreichen = () => screen.getByRole('button', { name: 'Einreichen' })

describe('ArbeitsZeitScreen — Korrekturantrag', () => {
  it('startet mit leerem Pausenfeld statt einer vorbelegten 0', () => {
    openForm()
    expect(pauseInput().value).toBe('')
  })

  it('führt beim Tippen keine 0 mit — "695" bleibt 695', () => {
    openForm()
    fireEvent.change(pauseInput(), { target: { value: '695' } })
    expect(pauseInput().value).toBe('695')
  })

  it('lässt sich wieder leeren', () => {
    // Der eigentliche Grund, warum die vorbelegte 0 im Feld stehen blieb: als
    // Zahl im controlled input war sie nicht löschbar. Backspace macht den
    // DOM-Wert '', Number('') ist wieder 0, React schreibt die 0 im selben
    // Event zurück ins Feld. Dem Monteur blieb nur, dahinter weiterzutippen.
    openForm()
    fireEvent.change(pauseInput(), { target: { value: '30' } })
    expect(pauseInput().value).toBe('30')

    fireEvent.change(pauseInput(), { target: { value: '' } })
    expect(pauseInput().value).toBe('')
  })

  it('blockiert eine Pause, die länger ist als die Anwesenheit', () => {
    openForm()
    fireEvent.change(timeInput('Einstempel'), { target: { value: '07:00' } })
    fireEvent.change(timeInput('Ausstempel'), { target: { value: '18:02' } })
    fireEvent.change(timeInput('Grund'), { target: { value: 'Vergessen einzustempeln' } })
    fireEvent.change(pauseInput(), { target: { value: '695' } })

    expect(screen.getByText(/muss kürzer sein/)).toBeInTheDocument()
    expect(einreichen()).toBeDisabled()

    fireEvent.change(pauseInput(), { target: { value: '30' } })
    expect(screen.queryByText(/muss kürzer sein/)).not.toBeInTheDocument()
    expect(einreichen()).not.toBeDisabled()
  })

  it('blockiert einen Ausstempel vor dem Einstempel', () => {
    openForm()
    fireEvent.change(timeInput('Einstempel'), { target: { value: '17:00' } })
    fireEvent.change(timeInput('Ausstempel'), { target: { value: '07:00' } })
    fireEvent.change(timeInput('Grund'), { target: { value: 'Vertippt' } })

    expect(screen.getByText(/nach dem Einstempel/)).toBeInTheDocument()
    expect(einreichen()).toBeDisabled()
  })
})
