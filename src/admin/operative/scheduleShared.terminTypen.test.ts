import { describe, it, expect } from 'vitest'
import { kindSymbol, terminLegend, TERMIN_SYMBOLS } from './scheduleShared'
import { APPOINTMENT_KINDS, APPOINTMENT_KIND_LABELS } from '../../api/admin/scheduling'

// Termin-Typen kommen aus EINER Registry (api/admin/scheduling.ts). Diese Tests
// halten fest, dass Symbol-Tabelle und Legende mitwachsen — sonst fällt ein neuer
// Typ (wie Demontage/Wiedermontage) still aus dem Kalender heraus.

describe('Termin-Typen im Kalender', () => {
  it('hat für jeden Typ ein Symbol', () => {
    for (const k of APPOINTMENT_KINDS) {
      expect(TERMIN_SYMBOLS[k], `Symbol fehlt für ${k}`).toBeTruthy()
    }
  })

  it('führt jeden Typ mit Symbol und Namen in der Legende', () => {
    const legend = terminLegend()
    for (const k of APPOINTMENT_KINDS) {
      expect(legend).toContain(`${TERMIN_SYMBOLS[k]} ${APPOINTMENT_KIND_LABELS[k]}`)
    }
    expect(legend).toContain('Demontage')
    expect(legend).toContain('Wiedermontage')
  })

  it('nimmt für Kundenprojekte das Termin-Symbol, Montage als Default', () => {
    expect(kindSymbol({ kind: 'project', termin_kind: 'demontage' } as never)).toBe(TERMIN_SYMBOLS.demontage)
    expect(kindSymbol({ kind: 'project', termin_kind: 'wiedermontage' } as never)).toBe(TERMIN_SYMBOLS.wiedermontage)
    // Ohne termin_kind gilt der Normalfall Montage.
    expect(kindSymbol({ kind: 'project' } as never)).toBe(TERMIN_SYMBOLS.montage)
  })

  it('nimmt bei internen Einsätzen die Einsatz-Art statt des Termin-Typs', () => {
    expect(kindSymbol({ kind: 'lagerarbeit', termin_kind: 'demontage' } as never)).toBe('📦')
  })
})
