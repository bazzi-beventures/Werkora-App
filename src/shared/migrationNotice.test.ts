import { describe, expect, it } from 'vitest'
import {
  istWeggeklickt,
  migrationStufe,
  migrationText,
  tageBisStichtag,
  wegklickWert,
  zielHost,
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
  const HEUTE = '2026-08-28'
  const MORGEN = '2026-08-29'

  it('hält einen weggeklickten Hinweis für den Rest des Tages weg', () => {
    expect(istWeggeklickt('hinweis', wegklickWert('hinweis', HEUTE), HEUTE)).toBe(true)
  })

  it('zeigt ihn am nächsten Morgen wieder', () => {
    // Der Kern der Regel. Ohne den Tag im Wert schaltete ein Klick am 28.08.
    // den Nutzer bis zur Eskalation am 04.09. stumm — eine Woche Stille bei
    // dem Kanal, der im Parallelbetrieb der einzige ist. Ein Klick pro Tag ist
    // billiger als ein Anruf am Stichtag.
    expect(istWeggeklickt('hinweis', wegklickWert('hinweis', HEUTE), MORGEN)).toBe(false)
  })

  it('zeigt ihn nach einer Eskalation wieder, auch am selben Tag', () => {
    expect(istWeggeklickt('dringend', wegklickWert('hinweis', HEUTE), HEUTE)).toBe(false)
    expect(istWeggeklickt('vorschalt', wegklickWert('dringend', HEUTE), HEUTE)).toBe(false)
  })

  it('wertet den Altbestand ohne Tag als nicht weggeklickt', () => {
    // Werte aus der ersten Fassung trugen nur die Stufe. Sie zu ignorieren
    // zeigt den Hinweis einmal zu viel — die richtige Richtung, und der Grund,
    // warum der Formatwechsel ohne APP_DATA_VERSION-Schritt auskommt.
    expect(istWeggeklickt('hinweis', 'hinweis', HEUTE)).toBe(false)
  })

  it('ist tolerant gegenüber Müll im localStorage', () => {
    expect(istWeggeklickt('hinweis', null, HEUTE)).toBe(false)
    expect(istWeggeklickt('hinweis', 'irgendwas', HEUTE)).toBe(false)
    expect(istWeggeklickt('hinweis', `irgendwas|${HEUTE}`, HEUTE)).toBe(false)
    expect(istWeggeklickt('hinweis', 'hinweis|Montag', HEUTE)).toBe(false)
  })
})

describe('migrationText', () => {
  it('formuliert den Countdown in der richtigen Zeitform', () => {
    expect(migrationText('dringend', 5, ZIEL).zeile1).toContain('in 5 Tagen')
    expect(migrationText('dringend', 1, ZIEL).zeile1).toContain('morgen')
    expect(migrationText('dringend', 0, ZIEL).zeile1).toContain('heute')
    expect(migrationText('vorschalt', -2, ZIEL).zeile1).toContain('ist abgeschaltet')
  })

  it('nennt auf der mildesten Stufe kein Datum', () => {
    // Am ersten Tag ist die Nachricht «es gibt eine neue Adresse», nicht
    // «dir laeuft die Zeit davon».
    expect(migrationText('hinweis', 14, ZIEL).zeile1).not.toMatch(/\d/)
  })

  it('nennt die Adresse auf JEDER Stufe im Klartext', () => {
    // Der Streifen ist zwar anklickbar — wer aber am Handy liest und am
    // Buerorechner wechseln will, muss die Adresse abtippen koennen. Beim
    // Umzug ist genau dieser Geraetewechsel der Normalfall.
    for (const [stufe, rest] of [['hinweis', 14], ['dringend', 5], ['vorschalt', 1]] as const) {
      expect(migrationText(stufe, rest, ZIEL).zeile2).toContain('app.werkora.ch')
    }
  })

  it('sagt auf JEDER Stufe, dass man sich neu anmelden muss', () => {
    // Die Anmeldung haengt am API-Host; auf der neuen Adresse ist man
    // zwangslaeufig ausgeloggt. Wer das nicht vorher liest, haelt den
    // Login-Screen fuer einen Fehler und ruft an.
    for (const [stufe, rest] of [['hinweis', 14], ['dringend', 5], ['vorschalt', 1]] as const) {
      expect(migrationText(stufe, rest, ZIEL).zeile2).toMatch(/neu anmelden/)
    }
  })

  it('sagt auf JEDER Stufe, dass die alte App geloescht werden muss', () => {
    // Der Adresswechsel allein reicht nicht: eine installierte PWA haengt an
    // der Origin, aus der sie installiert wurde, und startet weiter hier — der
    // Service Worker bedient sie aus dem Cache. Wer nur im Browser wechselt und
    // das alte Symbol behaelt, ist beim naechsten Antippen zurueck auf der
    // alten Adresse, ohne ein einziges Signal.
    for (const [stufe, rest] of [['hinweis', 14], ['dringend', 5], ['vorschalt', 1]] as const) {
      expect(migrationText(stufe, rest, ZIEL).zeile2).toMatch(/alte App löschen/)
    }
  })
})

describe('zielHost', () => {
  it('zieht den Hostnamen aus der Ziel-URL', () => {
    // Abgeleitet statt danebengeschrieben: sonst laufen Text und Link
    // auseinander und der Nutzer tippt eine Adresse ab, die es nicht gibt.
    expect(zielHost('https://app.werkora.ch')).toBe('app.werkora.ch')
    expect(zielHost('https://app.werkora.ch/')).toBe('app.werkora.ch')
    expect(zielHost('https://app.werkora.ch/pfad?x=1')).toBe('app.werkora.ch')
  })

  it('faellt bei Muell auf etwas Lesbares zurueck statt zu werfen', () => {
    // Der Wert kommt aus einer Env-Variable von Hand — ein Tippfehler darf
    // nicht die ganze App weiss werden lassen.
    expect(zielHost('app.werkora.ch')).toBe('app.werkora.ch')
    expect(zielHost('')).toBe('')
  })
})
