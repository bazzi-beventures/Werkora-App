import { describe, expect, it } from 'vitest'
import {
  generalDeductionError,
  generalDeductionPayload,
  initialGeneralDeduction,
  parseDeductionPct,
} from './generalDeduction'

describe('initialGeneralDeduction', () => {
  it('startet immer mit Häkchen aus, auch wenn eine Vorbelegung existiert', () => {
    const s = initialGeneralDeduction({ enabled: true, prozent: 1.2, basis: ['labor'] })
    expect(s.enabled).toBe(false)
    expect(s.pct).toBe('1.2')
    expect(s.sections).toEqual(['labor'])
  })

  it('ohne Konfiguration: Feld leer, alle drei Basen angehakt', () => {
    const s = initialGeneralDeduction(null)
    expect(s.pct).toBe('')
    expect(s.sections).toEqual(['labor', 'material', 'travel'])
  })

  it('Prozent 0 heisst «keine Vorgabe», unbekannte Basis-Schlüssel fallen weg', () => {
    const s = initialGeneralDeduction({ prozent: 0, basis: ['montage', 'travel'] })
    expect(s.pct).toBe('')
    expect(s.sections).toEqual(['travel'])
  })
})

describe('parseDeductionPct', () => {
  it('nimmt Punkt und Komma', () => {
    expect(parseDeductionPct('1.2')).toBe(1.2)
    expect(parseDeductionPct(' 1,20 ')).toBe(1.2)
  })

  it.each(['', '0', '-1', '100', 'abc'])('lehnt «%s» ab', raw => {
    expect(parseDeductionPct(raw)).toBeNull()
  })
})

describe('generalDeductionPayload', () => {
  it('Häkchen aus: nichts mitschicken', () => {
    expect(generalDeductionPayload({ enabled: false, pct: '1.2', sections: ['labor'] })).toEqual({})
  })

  it('Häkchen an: Satz und Basis in fester Reihenfolge', () => {
    expect(generalDeductionPayload({ enabled: true, pct: '1,2', sections: ['travel', 'labor'] }))
      .toEqual({ general_deduction_pct: 1.2, general_deduction_sections: ['labor', 'travel'] })
  })

  it('ungültige Eingabe: nichts mitschicken und Fehler melden', () => {
    const leer = { enabled: true, pct: '', sections: ['labor' as const] }
    expect(generalDeductionPayload(leer)).toEqual({})
    expect(generalDeductionError(leer)).not.toBeNull()
    const ohneBasis = { enabled: true, pct: '1.2', sections: [] }
    expect(generalDeductionPayload(ohneBasis)).toEqual({})
    expect(generalDeductionError(ohneBasis)).toBe('Mindestens eine Basis wählen.')
  })
})
