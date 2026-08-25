import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { backdropCloseProps } from './backdropClose'

// Kleines Testfenster: Overlay mit Inhalt, genau wie die echten Modals.
function Modal({ onClose, dirty, onBlocked }: { onClose: () => void; dirty?: boolean; onBlocked?: () => void }) {
  return (
    <div
      data-testid="overlay"
      {...backdropCloseProps(
        onClose,
        dirty === undefined ? undefined : { blockWhen: () => dirty, onBlocked },
      )}
    >
      <div data-testid="box">Inhalt</div>
    </div>
  )
}

describe('backdropCloseProps', () => {
  it('schliesst bei einem Klick, der auf dem Backdrop beginnt und endet', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<Modal onClose={onClose} />)
    const overlay = getByTestId('overlay')

    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('schliesst nicht, wenn eine Textauswahl im Inhalt auf dem Backdrop endet', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<Modal onClose={onClose} />)

    fireEvent.mouseDown(getByTestId('box'))
    fireEvent.click(getByTestId('overlay'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wirft bei ungespeicherten Eingaben nichts weg, sondern meldet sich über onBlocked', () => {
    const onClose = vi.fn()
    const onBlocked = vi.fn()
    const { getByTestId } = render(<Modal onClose={onClose} dirty onBlocked={onBlocked} />)
    const overlay = getByTestId('overlay')

    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).not.toHaveBeenCalled()
    expect(onBlocked).toHaveBeenCalledTimes(1)
  })

  it('schliesst weiterhin direkt, solange nichts Ungespeichertes drinsteht', () => {
    const onClose = vi.fn()
    const onBlocked = vi.fn()
    const { getByTestId } = render(<Modal onClose={onClose} dirty={false} onBlocked={onBlocked} />)
    const overlay = getByTestId('overlay')

    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onBlocked).not.toHaveBeenCalled()
  })

  it('setzt den mousedown-Merker nach einem geblockten Klick zurück', () => {
    // Sonst würde der nächste Klick (Auswahl-Drag aus dem Inhalt heraus) noch
    // am alten Merker hängen und fälschlich als Backdrop-Klick gelten.
    const onClose = vi.fn()
    const onBlocked = vi.fn()
    const { getByTestId } = render(<Modal onClose={onClose} dirty onBlocked={onBlocked} />)
    const overlay = getByTestId('overlay')

    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    fireEvent.click(overlay)
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
