import { describe, it, expect } from 'vitest'
import { SALUTATIONS, availableSalutations, salutationLabel } from './customers'
import type { UserInfo } from '../auth'

// Anrede-Auswahl im Kundenstamm (Migration 20260820b, «Frau und Herr» 20260905).
// Gegenstück im Backend: db.customers.SALUTATION_LABELS /
// SALUTATION_FEATURE_FLAGS und agents/routers/admin_customers.py.

function user(flags: Record<string, boolean>): UserInfo {
  return {
    feature_flags: Object.fromEntries(
      Object.entries(flags).map(([k, v]) => [k, { enabled: v }]),
    ),
  } as unknown as UserInfo
}

describe('availableSalutations', () => {
  it('zeigt ohne Flag nur Herr und Frau', () => {
    expect(availableSalutations(user({})).map(s => s.value)).toEqual(['herr', 'frau'])
  })

  it('zeigt «Frau und Herr», wenn das Flag gesetzt ist', () => {
    const values = availableSalutations(user({ anrede_frau_und_herr: true })).map(s => s.value)
    expect(values).toEqual(['herr', 'frau', 'frau_und_herr'])
  })

  it('behält die gespeicherte Anrede, wenn ihr Flag ausgeht', () => {
    // Sonst fiele sie beim nächsten Speichern still auf «—» zurück — das
    // Formular schickt immer den vollen Stand. Gegenstück im Backend:
    // _reject_locked_salutation lässt den bereits gespeicherten Wert durch.
    const values = availableSalutations(user({}), 'frau_und_herr').map(s => s.value)
    expect(values).toContain('frau_und_herr')
  })

  it('blendet nichts ein, nur weil ein anderes Flag an ist', () => {
    const values = availableSalutations(user({ eigentuemer_kontakt: true })).map(s => s.value)
    expect(values).not.toContain('frau_und_herr')
  })

  it('kommt ohne eingeloggten Nutzer klar', () => {
    expect(availableSalutations(null).map(s => s.value)).toEqual(['herr', 'frau'])
  })
})

describe('salutationLabel', () => {
  it('druckt auch die Anrede hinter dem Flag', () => {
    // Die Druckform kennt kein Flag: eine gespeicherte Paar-Anrede steht weiter
    // im Empfängerblock, auch wenn das Flag inzwischen aus ist.
    expect(salutationLabel('frau_und_herr')).toBe('Frau und Herr')
  })

  it('ergibt für unbekannt/leer nichts', () => {
    expect(salutationLabel(null)).toBe('')
    expect(salutationLabel('dr')).toBe('')
  })

  it('kennt für jeden Eintrag eine Druckform', () => {
    expect(SALUTATIONS.every(s => salutationLabel(s.value) === s.label)).toBe(true)
  })
})
