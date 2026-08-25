import { describe, it, expect } from 'vitest'
import { advance, retreat } from './navHistory'

describe('advance', () => {
  it('merkt sich die verlassene Ansicht', () => {
    expect(advance([], 'home', 'projekte')).toEqual(['home'])
  })

  it('stapelt beim Hineinnavigieren', () => {
    let h: string[] = advance([], 'home', 'arbeitszeit')
    h = advance(h, 'arbeitszeit', 'bericht')
    expect(h).toEqual(['home', 'arbeitszeit'])
  })

  it('ignoriert den Wechsel auf die bereits aktive Ansicht', () => {
    expect(advance(['home'], 'projekte', 'projekte')).toEqual(['home'])
  })

  it('schneidet den Rundweg weg statt ihn anzuhängen', () => {
    // home → projekte → home: der Hinweg ist rückgängig gemacht, der Verlauf
    // ist wieder leer. Sonst führte «Zurück» auf Home nach Projekte — vorwärts.
    const hin = advance([], 'home', 'projekte')
    expect(advance(hin, 'projekte', 'home')).toEqual([])
  })

  it('schneidet auch mitten im Verlauf ab', () => {
    // home → arbeitszeit → bericht, dann per Zurück-Knopf auf arbeitszeit:
    // danach darf nur noch home im Verlauf liegen.
    let h: string[] = advance([], 'home', 'arbeitszeit')
    h = advance(h, 'arbeitszeit', 'bericht')
    expect(advance(h, 'bericht', 'arbeitszeit')).toEqual(['home'])
  })

  it('hält den Verlauf beim Hin-und-Her zwischen zwei Reitern flach', () => {
    let h: string[] = []
    let current = 'home'
    for (let i = 0; i < 10; i++) {
      const next = current === 'home' ? 'projekte' : 'home'
      h = advance(h, current, next)
      current = next
    }
    expect(h.length).toBeLessThanOrEqual(1)
  })

  it('deckelt die Tiefe', () => {
    let h: string[] = []
    for (let i = 0; i < 40; i++) h = advance(h, `screen-${i}`, `screen-${i + 1}`)
    expect(h).toHaveLength(20)
    expect(h[h.length - 1]).toBe('screen-39')
  })

  it('nutzt den übergebenen Vergleich für zusammengesetzte Einträge', () => {
    type Entry = { screen: string; detailId: string | null }
    const same = (a: Entry, b: Entry) => a.screen === b.screen && a.detailId === b.detailId

    const liste: Entry = { screen: 'projects', detailId: null }
    const detailA: Entry = { screen: 'projects', detailId: 'a' }
    const detailB: Entry = { screen: 'projects', detailId: 'b' }

    let h = advance([], liste, detailA, same)
    h = advance(h, detailA, detailB, same)
    // Gleicher Screen, andere ID ⇒ zwei echte Stationen.
    expect(h).toEqual([liste, detailA])

    // Zurück auf die Liste schneidet beide Details weg.
    expect(advance(h, detailB, { screen: 'projects', detailId: null }, same)).toEqual([])
  })

  it('verändert den übergebenen Verlauf nicht', () => {
    const h = ['home']
    advance(h, 'projekte', 'profile')
    expect(h).toEqual(['home'])
  })
})

describe('retreat', () => {
  it('liefert an der Wurzel kein Ziel', () => {
    expect(retreat([])).toEqual({ history: [], previous: undefined })
  })

  it('nimmt die zuletzt verlassene Ansicht', () => {
    expect(retreat(['home', 'arbeitszeit'])).toEqual({
      history: ['home'],
      previous: 'arbeitszeit',
    })
  })

  it('läuft den Stapel bis zur Wurzel ab', () => {
    let h = ['home', 'arbeitszeit']
    const gesehen: (string | undefined)[] = []
    for (let i = 0; i < 3; i++) {
      const r = retreat(h)
      gesehen.push(r.previous)
      h = r.history
    }
    expect(gesehen).toEqual(['arbeitszeit', 'home', undefined])
  })

  it('verändert den übergebenen Verlauf nicht', () => {
    const h = ['home', 'arbeitszeit']
    retreat(h)
    expect(h).toEqual(['home', 'arbeitszeit'])
  })
})
