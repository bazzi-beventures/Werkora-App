import { describe, expect, it } from 'vitest'
import { customerPrefillFromQuery } from './customerPrefill'

// WW-71: der Suchtext aus dem Kundenfeld der Projektmaske wird zur Vorbelegung
// des neuen Kunden — im Feld, in dem die Suche ihn auch gefunden hätte.
describe('customerPrefillFromQuery', () => {
  it('leer bleibt leer', () => {
    expect(customerPrefillFromQuery('')).toEqual({})
    expect(customerPrefillFromQuery('   ')).toEqual({})
  })

  it('ein Name landet ungeteilt im Nachnamen — aufgeteilt wird in der Maske', () => {
    expect(customerPrefillFromQuery('  Hans   Muster ')).toEqual({ last_name: 'Hans Muster' })
    expect(customerPrefillFromQuery('Huber GmbH')).toEqual({ last_name: 'Huber GmbH' })
  })

  it('eine E-Mail-Adresse landet im Feld E-Mail', () => {
    expect(customerPrefillFromQuery('luca.bazzi@beventures.ch')).toEqual({ email: 'luca.bazzi@beventures.ch' })
  })

  it('eine Mobilnummer im Feld Mobil, eine Festnetznummer im Feld Festnetz', () => {
    expect(customerPrefillFromQuery('079 576 55 16')).toEqual({ phone: '079 576 55 16' })
    expect(customerPrefillFromQuery('+41 79 576 55 16')).toEqual({ phone: '+41 79 576 55 16' })
    expect(customerPrefillFromQuery('044/123 45 67')).toEqual({ phone_landline: '044/123 45 67' })
  })

  it('Name mit Zahl oder kurze Ziffernfolge ist keine Telefonnummer', () => {
    expect(customerPrefillFromQuery('Muster 8472')).toEqual({ last_name: 'Muster 8472' })
    expect(customerPrefillFromQuery('8472')).toEqual({ last_name: '8472' })
  })
})
