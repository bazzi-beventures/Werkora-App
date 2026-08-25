import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import {
  useBackButton, consumeBack, backHandlerCount,
  useScreenBack, consumeScreenBack, screenBackHandlerCount, SCREEN_BACK_DEPTH,
  _resetBackHandlers,
} from './backButton'

// Test-Overlay, das nur den Hook registriert.
function Overlay({ active, onBack }: { active: boolean; onBack: () => void }) {
  useBackButton(active, onBack)
  return null
}

// Test-Bereich mit eigenem Verlauf (wie AdminApp / die Projekt-Detailmaske).
function Bereich({ active, onBack, depth }: {
  active: boolean; onBack: () => boolean; depth?: number
}) {
  useScreenBack(active, onBack, depth)
  return null
}

beforeEach(() => { _resetBackHandlers() })

describe('backButton-Stack', () => {
  it('consumeBack gibt false zurück, wenn kein Overlay offen ist', () => {
    expect(consumeBack()).toBe(false)
  })

  it('registriert einen Handler bei active=true und ruft ihn bei consumeBack', () => {
    const onBack = vi.fn()
    render(<Overlay active onBack={onBack} />)

    expect(backHandlerCount()).toBe(1)
    expect(consumeBack()).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(backHandlerCount()).toBe(0)
  })

  it('registriert nichts, solange active=false', () => {
    render(<Overlay active={false} onBack={vi.fn()} />)
    expect(backHandlerCount()).toBe(0)
  })

  it('schliesst LIFO — das zuletzt geöffnete Overlay zuerst', () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <>
        <Overlay active onBack={first} />
        <Overlay active onBack={second} />
      </>,
    )

    expect(backHandlerCount()).toBe(2)
    consumeBack()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    consumeBack()
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('entfernt den Handler beim Unmount (kein Leak)', () => {
    const { unmount } = render(<Overlay active onBack={vi.fn()} />)
    expect(backHandlerCount()).toBe(1)
    unmount()
    expect(backHandlerCount()).toBe(0)
  })

  it('ruft immer die neueste onBack-Referenz auf', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Overlay active onBack={first} />)
    rerender(<Overlay active onBack={second} />)

    consumeBack()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('Screen-Zurück-Stack', () => {
  it('consumeScreenBack gibt false zurück, wenn niemand registriert ist', () => {
    expect(consumeScreenBack()).toBe(false)
  })

  it('reicht das Ergebnis des Handlers durch', () => {
    const { rerender } = render(<Bereich active onBack={() => true} />)
    expect(screenBackHandlerCount()).toBe(1)
    expect(consumeScreenBack()).toBe(true)

    // false = «bei mir ist die Wurzel erreicht» — der Aufrufer macht weiter.
    rerender(<Bereich active onBack={() => false} />)
    expect(consumeScreenBack()).toBe(false)
  })

  it('behält den Handler — anders als der Overlay-Stack wird er nicht gepoppt', () => {
    const onBack = vi.fn(() => true)
    render(<Bereich active onBack={onBack} />)

    consumeScreenBack()
    consumeScreenBack()
    consumeScreenBack()

    expect(onBack).toHaveBeenCalledTimes(3)
    expect(screenBackHandlerCount()).toBe(1)
  })

  it('fragt den zuletzt registrierten Bereich (Detailmaske über dem Bereich)', () => {
    const aussen = vi.fn(() => true)
    const innen = vi.fn(() => true)
    const { rerender } = render(
      <>
        <Bereich active onBack={aussen} />
        <Bereich active onBack={innen} />
      </>,
    )

    consumeScreenBack()
    expect(innen).toHaveBeenCalledTimes(1)
    expect(aussen).not.toHaveBeenCalled()

    // Detailmaske zu ⇒ der äussere Bereich übernimmt wieder.
    rerender(<><Bereich active onBack={aussen} /><Bereich active={false} onBack={innen} /></>)
    consumeScreenBack()
    expect(aussen).toHaveBeenCalledTimes(1)
  })

  it('fragt den innersten Handler, auch wenn er sich ZUERST anmeldet', () => {
    // Genau der Fall, den die Registrierungsreihenfolge falsch beantwortet:
    // React führt Effekte von innen nach aussen aus, die Detailmaske meldet
    // sich also vor ihrem Bereich an. Über `depth` gewinnt sie trotzdem.
    const detail = vi.fn(() => true)
    const bereich = vi.fn(() => true)
    render(
      <>
        <Bereich active onBack={detail} depth={SCREEN_BACK_DEPTH.detail} />
        <Bereich active onBack={bereich} depth={SCREEN_BACK_DEPTH.area} />
      </>,
    )

    consumeScreenBack()
    expect(detail).toHaveBeenCalledTimes(1)
    expect(bereich).not.toHaveBeenCalled()
  })

  it('entfernt den Handler beim Unmount (kein Leak)', () => {
    const { unmount } = render(<Bereich active onBack={() => true} />)
    expect(screenBackHandlerCount()).toBe(1)
    unmount()
    expect(screenBackHandlerCount()).toBe(0)
  })

  it('registriert nichts, solange active=false', () => {
    render(<Bereich active={false} onBack={() => true} />)
    expect(screenBackHandlerCount()).toBe(0)
  })
})
