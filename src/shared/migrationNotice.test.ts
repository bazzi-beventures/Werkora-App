import { describe, expect, it } from 'vitest'
import {
  istWeggeklickt,
  migrationStufe,
  migrationText,
  tageBisStichtag,
} from './migrationNotice'

// Der Umzugs-Hinweis ist im Parallelbetrieb der EINZIGE Kanal zum Nutzer: die
// alte Origin liefert serverseitig 404, aber der Service Worker bedient die App
// weiter aus dem Cache — der Nutzer sieht also sonst nichts (§4.4, am
// 2026-08-25 auf Staging gemessen). Eine Stufe, die zu früh oder zu spät
// schaltet, kostet damit direkt Reichweite.

const ZIEL = 'https://app.werkora.ch'
const STICHTAG = '2026-09-11'

/** Lokale Mitternacht — dieselbe Konvention wie parseDateStr. */
const tag = (jahr: number, monat1: number, t: number, std = 9) =>
  new Date(jahr, monat1 - 1, t, std)

describe('migrationStufe', () => {
  it('bleibt aus, solange kein Ziel gesetzt ist', () => {
    // Der Normalfall: im Build fuer die NEUE Domain ist das Flag leer, und
    // dort darf der Streifen unter keinen Umstaenden auftauchen.
    expect(migrationStufe(tag(2026, 9, 10), undefined, STICHTAG)).toBe('aus')
    expect(migrationStufe(tag(2026, 9, 10), '', STICHTAG)).toBe('aus')
  })

  it('bleibt beim mildesten Hinweis, wenn kein Stichtag bekannt ist', () => {
    // Ohne Datum gibt es nichts, worauf man eskalieren koennte. Raten waere
    // schlechter als mild bleiben.
    expect(migrationStufe(tag(2026, 9, 10), ZIEL, undefined)).toBe('hinweis')
    expect(migrationStufe(tag(2026, 9, 10), ZIEL, '')).toBe('hinweis')
  })

  it('durchläuft die drei Stufen an den geplanten Tagen', () => {
    const stufe = (m: number, t: number) => migrationStufe(tag(2026, m, t), ZIEL, STICHTAG)
    // Cutover Fr 28.08. → 14 Tage Rest
    expect(stufe(8, 28)).toBe('hinweis')
    expect(stufe(9, 3)).toBe('hinweis')    // X+6, 8 Tage Rest — noch dezent
    expect(stufe(9, 4)).toBe('dringend')   // X+7, 7 Tage Rest — Schwelle
    expect(stufe(9, 8)).toBe('dringend')   // X+11, 3 Tage Rest
    expect(stufe(9, 9)).toBe('vorschalt')  // X+12, 2 Tage Rest — Schwelle
    expect(stufe(9, 11)).toBe('vorschalt') // Stichtag selbst
  })

  it('bleibt nach dem Stichtag auf der höchsten Stufe', () => {
    // Wenn der Killer-SW ein Geraet nicht erreicht hat, ist die Vorschaltseite
    // das Letzte, was diesen Nutzer noch abholt.
    expect(migrationStufe(tag(2026, 9, 20), ZIEL, STICHTAG)).toBe('vorschalt')
    expect(migrationStufe(tag(2026, 12, 1), ZIEL, STICHTAG)).toBe('vorschalt')
  })
})

describe('tageBisStichtag', () => {
  it('zählt Kalendertage, nicht 24-Stunden-Blöcke', () => {
    // Spaet am Tag darf den Countdown nicht um einen Tag verschieben.
    expect(tageBisStichtag(tag(2026, 9, 9, 23), STICHTAG)).toBe(2)
    expect(tageBisStichtag(tag(2026, 9, 9, 0), STICHTAG)).toBe(2)
  })

  it('übersteht die Zeitumstellung', () => {
    // Der 25.10.2026 ist der Rueckfall auf Winterzeit — dieser Tag hat 25
    // Stunden. Eine Millisekunden-Division laege hier um einen Tag daneben.
    expect(tageBisStichtag(tag(2026, 10, 24), '2026-10-26')).toBe(2)
    expect(tageBisStichtag(tag(2026, 10, 25), '2026-10-26')).toBe(1)
  })

  it('wird negativ, wenn der Stichtag vorbei ist', () => {
    expect(tageBisStichtag(tag(2026, 9, 12), STICHTAG)).toBe(-1)
  })
})

describe('istWeggeklickt', () => {
  it('hält einen weggeklickten Hinweis auf derselben Stufe weg', () => {
    expect(istWeggeklickt('hinweis', 'hinweis')).toBe(true)
  })

  it('zeigt ihn nach einer Eskalation wieder', () => {
    // Der Kern der Regel: ein Klick am ersten Tag darf den Nutzer nicht fuer
    // zwei Wochen stummschalten — sonst steht genau der am Stichtag vor der
    // Zwangsumleitung.
    expect(istWeggeklickt('dringend', 'hinweis')).toBe(false)
    expect(istWeggeklickt('vorschalt', 'dringend')).toBe(false)
  })

  it('ist tolerant gegenüber Müll im localStorage', () => {
    expect(istWeggeklickt('hinweis', null)).toBe(false)
    expect(istWeggeklickt('hinweis', 'irgendwas')).toBe(false)
  })
})

describe('migrationText', () => {
  it('formuliert den Countdown in der richtigen Zeitform', () => {
    expect(migrationText('dringend', 5)).toContain('in 5 Tagen')
    expect(migrationText('dringend', 1)).toContain('morgen')
    expect(migrationText('dringend', 0)).toContain('heute')
    expect(migrationText('vorschalt', -2)).toContain('ist abgeschaltet')
  })

  it('nennt auf der mildesten Stufe kein Datum', () => {
    // Am ersten Tag ist die Nachricht «es gibt eine neue Adresse», nicht
    // «dir laeuft die Zeit davon».
    expect(migrationText('hinweis', 14)).not.toMatch(/\d/)
  })
})
