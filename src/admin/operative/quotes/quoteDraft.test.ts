import { describe, it, expect } from 'vitest'
import { quoteDraftHasContent } from './quoteDraft'

// Der Auto-Entwurf darf nur anspringen, wenn wirklich etwas eingegeben wurde.
// Mit der Skonto-Vorgabe (Offert-Vorlagen) startet das Formular nicht mehr leer —
// die Vorgabe selbst ist darum kein Inhalt.

type Draft = Parameters<typeof quoteDraftHasContent>[0]

function draft(over: Partial<Draft> = {}): Draft {
  return {
    projectName: 'Storenmontage Müller',
    laborRows: [{ description: '', quantity: '', unit_price: null, hidden: false }],
    materialRows: [{ art_nr: '', quantity: '' }],
    extraProducts: [],
    extraCharges: [],
    includeTravelCost: true,
    installationRows: [],
    specialRows: [],
    laborDiscount: '',
    materialDiscount: '',
    fixedPrice: '',
    skontoActive: false,
    skontoPct: '',
    skontoDays: '',
    notes: '',
    productDescription: '',
    useStandardNotes: true,
    ...over,
  } as Draft
}

describe('quoteDraftHasContent — Skonto-Vorgabe', () => {
  it('zählt das leere Formular ohne Vorgabe nicht als Entwurf', () => {
    expect(quoteDraftHasContent(draft(), '')).toBe(false)
  })

  it('zählt die unveränderte Vorgabe nicht als Entwurf', () => {
    const d = draft({ skontoPct: '2', skontoDays: '10' })
    expect(quoteDraftHasContent(d, '', { pct: '2', days: '10' })).toBe(false)
  })

  it('erkennt einen abweichenden Skonto-Satz als Eingabe', () => {
    const d = draft({ skontoPct: '3', skontoDays: '10' })
    expect(quoteDraftHasContent(d, '', { pct: '2', days: '10' })).toBe(true)
  })

  it('erkennt eine abweichende Frist als Eingabe', () => {
    const d = draft({ skontoPct: '2', skontoDays: '30' })
    expect(quoteDraftHasContent(d, '', { pct: '2', days: '10' })).toBe(true)
  })

  it('erkennt das bewusste Leeren der vorbelegten Felder als Eingabe', () => {
    // Wer die Vorgabe wegnimmt, will kein Skonto — das muss der Entwurf behalten.
    expect(quoteDraftHasContent(draft(), '', { pct: '2', days: '10' })).toBe(true)
  })

  it('zählt Skonto ohne Vorgabe weiterhin als Eingabe (Verhalten vor der Vorgabe)', () => {
    expect(quoteDraftHasContent(draft({ skontoPct: '2' }), '')).toBe(true)
  })

  it('erkennt das Anhaken als Eingabe, auch wenn Satz und Frist auf der Vorgabe stehen', () => {
    // Das Häkchen startet immer aus — wer es setzt, hat eine Entscheidung getroffen.
    const d = draft({ skontoActive: true, skontoPct: '2', skontoDays: '10' })
    expect(quoteDraftHasContent(d, '', { pct: '2', days: '10' })).toBe(true)
  })

  it('liest einen Altentwurf ohne das Häkchen-Feld aus dem %-Satz', () => {
    // Vor dem Häkchen hiess ein gefüllter Satz "Skonto an" — der Entwurf darf das
    // nicht verlieren, sonst stünde er beim Öffnen wieder ohne Skonto da.
    const d = draft({ skontoPct: '2', skontoDays: '10' })
    delete (d as { skontoActive?: boolean }).skontoActive
    expect(quoteDraftHasContent(d, '', { pct: '2', days: '10' })).toBe(true)
  })
})
