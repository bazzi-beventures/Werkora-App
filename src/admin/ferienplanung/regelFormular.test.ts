import { describe, expect, it } from 'vitest'
import type { FerienRegel } from '../../api/admin/ferienplanung'
import { LEERE_REGEL, regelDaten, regelEingabe, regelSatz, vorlageAlsRegel } from './regelFormular'

const BASIS: FerienRegel = {
  id: 'r1', titel: 'x', art: 'gleichzeitig', gruppe_id: null, staff_ids: [], parameter: {}, haerte: 'hart',
  gueltig_ab: null, gueltig_bis: null, status: 'aktiv', quelle: 'admin',
}

describe('regelFormular', () => {
  it('«Personen nicht gleichzeitig» wird max_abwesend 1 über die Personenliste', () => {
    expect(regelDaten({ ...LEERE_REGEL, titel: ' Anna/Beat ', personen: ['a', 'b'], hart: true })).toEqual({
      titel: 'Anna/Beat', haerte: 'hart', status: 'aktiv', art: 'gleichzeitig', staff_ids: ['a', 'b'],
      gruppe_id: null, parameter: { max_abwesend: 1 },
    })
  })

  it('Gruppe min/max, max am Stück und Vorlauf', () => {
    const e = { ...LEERE_REGEL, titel: 't', gruppeId: 'g', zahl: 2 }
    expect(regelDaten({ ...e, formulierung: 'gruppe_max' }).parameter).toEqual({ max_abwesend: 2 })
    expect(regelDaten({ ...e, formulierung: 'gruppe_min' }).parameter).toEqual({ min_anwesend: 2 })
    expect(regelDaten({ ...e, formulierung: 'max_am_stueck', zahl: 15 })).toMatchObject({
      art: 'max_am_stueck', parameter: { arbeitstage: 15 }, haerte: 'weich' })
    expect(regelDaten({ ...e, formulierung: 'vorlauf', gruppeId: '', zahl: 30 })).toMatchObject({
      art: 'vorlauf', gruppe_id: null, parameter: { tage: 30 } })
  })

  it('Hin und zurück ergibt dieselbe Eingabe', () => {
    const e = { ...LEERE_REGEL, formulierung: 'gruppe_min' as const, titel: 'PL', gruppeId: 'g', zahl: 1, hart: true }
    expect(regelEingabe({ ...BASIS, ...regelDaten(e) } as FerienRegel)).toEqual({ ...e, personen: [] })
  })

  it('Satz für die Liste', () => {
    const name = (id: string) => ({ a: 'Anna', b: 'Beat', g: 'Monteure' } as Record<string, string>)[id]
    expect(regelSatz({ ...BASIS, staff_ids: ['a', 'b'], parameter: { max_abwesend: 1 } }, name, name))
      .toBe('Anna, Beat: nicht gleichzeitig')
    expect(regelSatz({ ...BASIS, gruppe_id: 'g', parameter: { max_abwesend: 2 } }, name, name))
      .toBe('Gruppe «Monteure»: höchstens 2 gleichzeitig weg')
    expect(regelSatz({ ...BASIS, art: 'vorlauf', parameter: { tage: 30 } }, name, name))
      .toBe('alle: Antrag mindestens 30 Tage vorher')
  })

  it('Vorlage als Regel', () => {
    expect(regelEingabe(vorlageAlsRegel({ titel: 'PL', art: 'gleichzeitig', parameter: { min_anwesend: 1 }, haerte: 'hart' })))
      .toMatchObject({ formulierung: 'gruppe_min', zahl: 1, hart: true, gruppeId: '' })
  })
})
