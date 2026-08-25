import { describe, it, expect } from 'vitest'
import { findCustomerMatch, normalize } from './customerMatch'

const c = (name: string) => ({ id: name, name })

describe('normalize', () => {
  it('faltet Umlaute und Sonderzeichen', () => {
    expect(normalize('Müller-Bräm AG')).toBe('mueller braem ag')
    expect(normalize('  Meier,  Hans ')).toBe('meier hans')
  })
})

describe('findCustomerMatch', () => {
  it('erkennt den exakten Namen und markiert ihn als exakt', () => {
    const m = findCustomerMatch('Baumgartner Rolf', [c('Andere AG'), c('Baumgartner Rolf')])
    expect(m?.customer.name).toBe('Baumgartner Rolf')
    expect(m?.exact).toBe(true)
  })

  it('ignoriert Gross-/Kleinschreibung und Interpunktion beim exakten Treffer', () => {
    const m = findCustomerMatch('müller-bräm ag', [c('Müller Bräm AG')])
    expect(m?.exact).toBe(true)
  })

  // Der Regressionsfall: ein Stammkunde namens "A" passte per Teilstring auf
  // jeden Entwurf und wurde ungefragt ins Projekt geschrieben.
  it('matcht keinen Ein-Buchstaben-Kunden', () => {
    expect(findCustomerMatch('Baumgartner Rolf und Sandra', [c('A')])).toBeNull()
  })

  it('matcht nicht über einen blossen Vornamen', () => {
    expect(findCustomerMatch('Baumgartner Rolf und Sandra', [c('Meier Rolf')])).toBeNull()
  })

  it('matcht nicht über eine blosse Rechtsform', () => {
    expect(findCustomerMatch('Baumgartner AG', [c('Zimmerli AG')])).toBeNull()
  })

  it('findet den Nachnamen, wenn er den Stammkunden ganz abdeckt', () => {
    const m = findCustomerMatch('Baumgartner Rolf und Sandra', [c('A'), c('Baumgartner')])
    expect(m?.customer.name).toBe('Baumgartner')
    expect(m?.exact).toBe(false)
  })

  it('akzeptiert zwei gemeinsame Bestandteile in beliebiger Reihenfolge', () => {
    const m = findCustomerMatch('Rolf Baumgartner', [c('Baumgartner Rolf')])
    expect(m?.customer.name).toBe('Baumgartner Rolf')
    expect(m?.exact).toBe(false)
  })

  it('nimmt bei mehreren Kandidaten den mit dem längsten Beleg', () => {
    const m = findCustomerMatch('Baumgartner Rolf Sandra', [
      c('Sandra Kuenzli'),
      c('Baumgartner Rolf'),
    ])
    expect(m?.customer.name).toBe('Baumgartner Rolf')
  })

  it('liefert null bei leerem Namen oder leerem Stamm', () => {
    expect(findCustomerMatch('', [c('Baumgartner')])).toBeNull()
    expect(findCustomerMatch('Baumgartner', [])).toBeNull()
  })
})
