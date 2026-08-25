import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { useScrollEdge } from './useScrollEdge'

// Die Ausblendkante (Tab-Leiste, breite KPI-Tabellen) haengt allein an dieser
// Klasse: fehlt sie faelschlich, sieht die letzte Spalte abgeschnitten aus;
// bleibt sie faelschlich weg, fehlt der "hier geht es weiter"-Hinweis.
// jsdom rechnet kein Layout, deshalb werden die drei Masse gesetzt.

function Strip({ scrollWidth, clientWidth, scrollLeft }: {
  scrollWidth: number; clientWidth: number; scrollLeft: number
}) {
  const ref = useScrollEdge<HTMLDivElement>()
  return (
    <div
      data-testid="strip"
      ref={(node) => {
        ref.current = node
        if (!node) return
        Object.defineProperty(node, 'scrollWidth', { value: scrollWidth, configurable: true })
        Object.defineProperty(node, 'clientWidth', { value: clientWidth, configurable: true })
        node.scrollLeft = scrollLeft
      }}
    />
  )
}

describe('useScrollEdge', () => {
  it('setzt is-scroll-end nicht, solange rechts noch Inhalt folgt', () => {
    const { getByTestId } = render(<Strip scrollWidth={600} clientWidth={300} scrollLeft={0} />)
    expect(getByTestId('strip').classList.contains('is-scroll-end')).toBe(false)
  })

  it('setzt is-scroll-end, wenn ganz nach rechts gescrollt ist', () => {
    const { getByTestId } = render(<Strip scrollWidth={600} clientWidth={300} scrollLeft={300} />)
    expect(getByTestId('strip').classList.contains('is-scroll-end')).toBe(true)
  })

  it('setzt is-scroll-end, wenn der Inhalt gar nicht scrollt', () => {
    const { getByTestId } = render(<Strip scrollWidth={300} clientWidth={300} scrollLeft={0} />)
    expect(getByTestId('strip').classList.contains('is-scroll-end')).toBe(true)
  })

  it('schaltet beim Scrollen um', () => {
    const { getByTestId } = render(<Strip scrollWidth={600} clientWidth={300} scrollLeft={0} />)
    const el = getByTestId('strip')
    expect(el.classList.contains('is-scroll-end')).toBe(false)
    act(() => {
      el.scrollLeft = 300
      el.dispatchEvent(new Event('scroll'))
    })
    expect(el.classList.contains('is-scroll-end')).toBe(true)
  })
})
