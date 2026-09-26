import { describe, expect, it } from 'vitest'

import {
  addMonths, parseIsoDate, parseWarrantyConfig, projectWarranty,
  startOfDay, warrantyBadge, warrantyState,
} from './warranty'

const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}

// Zeile für Zeile dieselben Fälle wie tests/unit/test_warranty.py::FRIST_FAELLE.
// Wer hier einen ergänzt, ergänzt ihn dort mit — sonst zeigt die Projektliste
// eine andere Frist als die Projektmaske.
const FRIST_FAELLE: Array<[string | null, number, number, string, string]> = [
  ['2026-03-14', 24, 60, '2026-09-22', 'in_garantie'],
  ['2024-03-14', 24, 60, '2026-03-14', 'in_garantie'],
  ['2024-03-14', 24, 60, '2026-03-15', 'nur_verdeckte_maengel'],
  ['2024-03-14', 24, 60, '2029-03-14', 'nur_verdeckte_maengel'],
  ['2024-03-14', 24, 60, '2029-03-15', 'abgelaufen'],
  ['2024-08-31', 6, 12, '2025-02-28', 'in_garantie'],
  ['2024-08-31', 6, 12, '2025-03-01', 'nur_verdeckte_maengel'],
  [null, 24, 60, '2026-09-22', 'unbekannt'],
]

describe('Garantiefrist — dieselbe Tabelle wie im Backend', () => {
  it.each(FRIST_FAELLE)(
    'Abnahme %s, %i/%i Monate, Stichtag %s → %s',
    (abnahme, ruegefrist_monate, verjaehrung_monate, stichtag, erwartet) => {
      const result = projectWarranty(
        { completed_at: abnahme },
        { ruegefrist_monate, verjaehrung_monate, frist_anker: 'abnahme' },
        d(stichtag),
      )
      expect(result.state).toBe(erwartet)
    },
  )
})

describe('parseIsoDate', () => {
  it('liest timestamptz und reines Datum', () => {
    expect(parseIsoDate('2026-03-14T08:12:00+00:00')).toEqual(d('2026-03-14'))
    expect(parseIsoDate('2026-03-14')).toEqual(d('2026-03-14'))
  })

  it('legt das Datum auf lokale Mitternacht, nicht auf UTC', () => {
    // `new Date('2026-03-14')` waere UTC-Mitternacht und westlich von Greenwich
    // der 13. Maerz — eine Frist, die je nach Zeitzone einen Tag frueher endet.
    const parsed = parseIsoDate('2026-03-14')!
    expect(parsed.getDate()).toBe(14)
    expect(parsed.getMonth()).toBe(2)
    expect(parsed.getHours()).toBe(0)
  })

  it('gibt null fuer Leeres und Unlesbares', () => {
    expect(parseIsoDate(null)).toBeNull()
    expect(parseIsoDate(undefined)).toBeNull()
    expect(parseIsoDate('')).toBeNull()
    expect(parseIsoDate('kein Datum')).toBeNull()
  })
})

describe('addMonths', () => {
  it('klemmt den Tag aufs Monatsende', () => {
    expect(addMonths(d('2025-12-31'), 2)).toEqual(d('2026-02-28'))
    expect(addMonths(d('2024-01-31'), 1)).toEqual(d('2024-02-29')) // Schaltjahr
  })

  it('rechnet ueber Jahresgrenzen', () => {
    expect(addMonths(d('2026-11-15'), 3)).toEqual(d('2027-02-15'))
  })
})

describe('Konfiguration', () => {
  it('nimmt die Defaults ohne Eintrag', () => {
    expect(parseWarrantyConfig(null)).toEqual({
      ruegefrist: 24, verjaehrung: 60, anchorKind: 'abnahme',
    })
  })

  it('faellt bei unbekanntem Anker auf die Abnahme zurueck', () => {
    expect(parseWarrantyConfig({ frist_anker: 'vollmond' }).anchorKind).toBe('abnahme')
  })

  it('hebt eine zu kurze Verjaehrung auf die Ruegefrist an', () => {
    const cfg = parseWarrantyConfig({ ruegefrist_monate: 24, verjaehrung_monate: 12 })
    expect(cfg.verjaehrung).toBe(24)
  })

  it('klemmt unsinnige Werte', () => {
    expect(parseWarrantyConfig({ ruegefrist_monate: -5 }).ruegefrist).toBe(0)
    expect(parseWarrantyConfig({ ruegefrist_monate: 9999 }).ruegefrist).toBe(600)
  })
})

describe('Anker', () => {
  const zeile = {
    completed_at: '2024-03-14T00:00:00+00:00',
    warranty_invoice_anchor_at: '2024-06-01T00:00:00+00:00',
  }

  it('nimmt die Abnahme', () => {
    const r = projectWarranty(zeile, { frist_anker: 'abnahme' }, d('2025-01-01'))
    expect(r.anchorAt).toEqual(d('2024-03-14'))
  })

  it('nimmt das Rechnungsdatum, wenn so konfiguriert', () => {
    const r = projectWarranty(zeile, { frist_anker: 'rechnung' }, d('2025-01-01'))
    expect(r.anchorAt).toEqual(d('2024-06-01'))
  })

  it('faellt beim Rechnungsanker nicht still auf die Abnahme zurueck', () => {
    const r = projectWarranty(
      { completed_at: '2024-03-14' }, { frist_anker: 'rechnung' }, d('2025-01-01'))
    expect(r.anchorAt).toBeNull()
    expect(r.state).toBe('unbekannt')
  })
})

describe('warrantyBadge', () => {
  it('zeigt bei unbekannter Frist gar nichts', () => {
    // Ein Badge «Frist unbekannt» staende auf jedem laufenden Projekt und waere
    // damit wertlos.
    expect(warrantyBadge({ state: 'unbekannt', deadlineAt: null, expiryAt: null })).toBeNull()
  })

  it('nennt das Datum, bis zu dem die Garantie laeuft', () => {
    const badge = warrantyBadge({
      state: 'in_garantie', deadlineAt: d('2027-03-14'), expiryAt: d('2030-03-14'),
    })
    expect(badge?.tone).toBe('ok')
    expect(badge?.text).toContain('2027')
  })

  it('nennt nach der Ruegefrist die Verjaehrung', () => {
    const badge = warrantyBadge({
      state: 'nur_verdeckte_maengel', deadlineAt: d('2026-03-14'), expiryAt: d('2029-03-14'),
    })
    expect(badge?.tone).toBe('warn')
    expect(badge?.text).toContain('verdeckte')
    expect(badge?.text).toContain('2029')
  })

  it('sagt abgelaufen ohne Datum', () => {
    const badge = warrantyBadge({
      state: 'abgelaufen', deadlineAt: d('2020-01-01'), expiryAt: d('2023-01-01'),
    })
    expect(badge?.tone).toBe('muted')
    expect(badge?.text).toBe('Garantie abgelaufen')
  })
})

describe('warrantyState direkt', () => {
  it('haelt den Tag der Frist noch fuer fristgerecht', () => {
    expect(warrantyState(d('2026-03-14'), d('2026-03-14'), d('2029-03-14'))).toBe('in_garantie')
  })

  it('ohne Ruegefrist keine Aussage', () => {
    expect(warrantyState(d('2026-03-14'), null, null)).toBe('unbekannt')
  })
})

// Der Stichtag kommt in der Projektliste aus `new Date()` und traegt damit die
// Tageszeit, waehrend die Fristen auf Mitternacht stehen. Ohne Normalisierung
// waere der LETZTE Tag der Frist schon «abgelaufen» — und die Liste widerspraeche
// dem Server, der auf Tagesebene vergleicht.
describe('Stichtag mit Uhrzeit', () => {
  const mitUhrzeit = (iso: string, h: number, min = 0) => {
    const [y, m, day] = iso.split('-').map(Number)
    return new Date(y, m - 1, day, h, min)
  }

  it.each([0, 9, 12, 23])(
    'am letzten Tag der Frist um %i Uhr noch in Garantie',
    stunde => {
      const state = warrantyState(
        mitUhrzeit('2026-03-14', stunde), d('2026-03-14'), d('2029-03-14'))
      expect(state).toBe('in_garantie')
    },
  )

  it('am Tag nach der Frist auch um 00:01 nicht mehr', () => {
    const state = warrantyState(
      mitUhrzeit('2026-03-15', 0, 1), d('2026-03-14'), d('2029-03-14'))
    expect(state).toBe('nur_verdeckte_maengel')
  })

  it('projectWarranty rechnet mit demselben Stichtag wie der Server', () => {
    // Genau der Fall aus tests/unit/test_warranty.py: Abnahme 14.03.2024,
    // 24 Monate, Stichtag 14.03.2026 → in Garantie. Der Server vergleicht Daten,
    // die Liste ein `new Date()` mit Uhrzeit.
    const result = projectWarranty(
      { completed_at: '2024-03-14' },
      { ruegefrist_monate: 24, verjaehrung_monate: 60, frist_anker: 'abnahme' },
      mitUhrzeit('2026-03-14', 10, 30),
    )
    expect(result.state).toBe('in_garantie')
  })

  it('startOfDay wirft die Uhrzeit weg', () => {
    expect(startOfDay(mitUhrzeit('2026-03-14', 23, 59))).toEqual(d('2026-03-14'))
  })
})
