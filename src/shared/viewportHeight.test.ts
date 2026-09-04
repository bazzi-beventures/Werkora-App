import { describe, it, expect, beforeEach } from 'vitest'
import { trackViewportHeight } from './viewportHeight'

/** Fensterhöhe setzen und das zugehörige Ereignis auslösen. */
function resizeTo(px: number, event = 'resize') {
  Object.defineProperty(window, 'innerHeight', { value: px, configurable: true, writable: true })
  window.dispatchEvent(new Event(event))
}

const current = () => document.documentElement.style.getPropertyValue('--app-vh')

describe('viewportHeight — --app-vh', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--app-vh')
  })

  it('schreibt die sichtbare Höhe schon beim ersten Aufruf', () => {
    resizeTo(812)
    trackViewportHeight()
    expect(current()).toBe('812px')
  })

  it('zieht bei eingefahrener Browserleiste nach', () => {
    trackViewportHeight()
    resizeTo(724)
    expect(current()).toBe('724px')
    resizeTo(812)
    expect(current()).toBe('812px')
  })

  it('folgt auch dem Drehen und der Rückkehr aus dem Back/Forward-Cache', () => {
    trackViewportHeight()
    resizeTo(390, 'orientationchange')
    expect(current()).toBe('390px')
    resizeTo(844, 'pageshow')
    expect(current()).toBe('844px')
  })

  it('lässt einen unbrauchbaren Wert stehen, statt die Shell auf 0 zu ziehen', () => {
    resizeTo(812)
    trackViewportHeight()
    resizeTo(0)
    expect(current()).toBe('812px')
  })
})
