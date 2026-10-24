import { describe, it, expect, beforeEach } from 'vitest'
import {
  PL_FRAGE_MAX, isInhaltlicheAenderung, loadSuppressed, shouldAskTakeover, suppressProject,
  type TakeoverContext,
} from './projektleiterRueckfrage'

// docs/specs/projektleiter-uebernahme.md §3.1 — die vier Bedingungen.

const CTX: TakeoverContext = { enabled: true, myStaffId: 's-ich', iAmProjektleiter: true }
const BASE = {
  ctx: CTX,
  projectId: 'p-1',
  projektleiterId: 's-anna',
  fields: ['name'] as const,
  askedThisSession: new Set<string>(),
  suppressed: new Set<string>(),
}

beforeEach(() => localStorage.clear())

describe('shouldAskTakeover', () => {
  it('fragt, wenn alle vier Bedingungen gelten — auch bei einem Projekt ohne Projektleiter', () => {
    expect(shouldAskTakeover({ ...BASE, fields: [...BASE.fields] })).toBe(true)
    expect(shouldAskTakeover({ ...BASE, fields: ['customerId'], projektleiterId: '' })).toBe(true)
  })

  it('nie ohne Feature, ohne eigenen Mitarbeiter oder ohne Projektleiter-Häkchen', () => {
    const f = ['name'] as const
    expect(shouldAskTakeover({ ...BASE, fields: [...f], ctx: { ...CTX, enabled: false } })).toBe(false)
    expect(shouldAskTakeover({ ...BASE, fields: [...f], ctx: { ...CTX, myStaffId: null } })).toBe(false)
    expect(shouldAskTakeover({ ...BASE, fields: [...f], ctx: { ...CTX, iAmProjektleiter: false } })).toBe(false)
  })

  it('nicht, wenn ich das Projekt schon leite', () => {
    expect(shouldAskTakeover({ ...BASE, fields: ['name'], projektleiterId: 's-ich' })).toBe(false)
  })

  it('nicht bei einer reinen Notiz oder wenn der Projektleiter selbst geändert wird', () => {
    expect(shouldAskTakeover({ ...BASE, fields: ['bemerkung'] })).toBe(false)
    expect(shouldAskTakeover({ ...BASE, fields: ['projektleiterId', 'name'] })).toBe(false)
  })

  it('höchstens einmal pro Sitzung und nie nach «Nicht mehr fragen»', () => {
    expect(shouldAskTakeover({ ...BASE, fields: ['name'], askedThisSession: new Set(['p-1']) })).toBe(false)
    expect(shouldAskTakeover({ ...BASE, fields: ['name'], suppressed: new Set(['p-1']) })).toBe(false)
  })
})

describe('isInhaltlicheAenderung', () => {
  it('Notiz zählt nicht, alles andere schon', () => {
    expect(isInhaltlicheAenderung([])).toBe(false)
    expect(isInhaltlicheAenderung(['bemerkung'])).toBe(false)
    expect(isInhaltlicheAenderung(['bemerkung', 'objectAddress'])).toBe(true)
  })
})

describe('«Für dieses Projekt nicht mehr fragen»', () => {
  it('merkt sich das Projekt pro Konto', () => {
    suppressProject('u-1', 'p-1')
    expect(loadSuppressed('u-1').has('p-1')).toBe(true)
    expect(loadSuppressed('u-2').has('p-1')).toBe(false)
    expect(loadSuppressed(null).size).toBe(0)
  })

  it(`hält höchstens ${PL_FRAGE_MAX} Projekte — die ältesten fallen heraus`, () => {
    for (let i = 0; i < PL_FRAGE_MAX + 5; i++) suppressProject('u-1', `p-${i}`)
    const s = loadSuppressed('u-1')
    expect(s.size).toBe(PL_FRAGE_MAX)
    expect(s.has('p-0')).toBe(false)
    expect(s.has(`p-${PL_FRAGE_MAX + 4}`)).toBe(true)
  })

  it('ein kaputter Eintrag ist kein Fehler', () => {
    localStorage.setItem('pl-frage-aus:u-1', '{kaputt')
    expect(loadSuppressed('u-1').size).toBe(0)
  })
})
