import { describe, it, expect } from 'vitest'
import { KONTAKT_FELD_LABEL, kontaktVorbefuellung } from './customerErgaenzung'

// docs/specs/mail-eingang-triage.md §4.2 — «Kontakt ergänzen» öffnet die
// Kundenmaske vorbefüllt, aber nur ein leeres Feld.

const kunde = { email: null, phone: '079 111 22 33', phone_landline: '  ' }

describe('kontaktVorbefuellung', () => {
  it('füllt ein leeres Feld vor und sagt, dass noch nichts gespeichert ist', () => {
    const v = kontaktVorbefuellung(kunde, { feld: 'email', wert: ' hans@muster.ch ' })
    expect(v?.werte).toEqual({ email: 'hans@muster.ch' })
    expect(v?.eingetragen).toBe(true)
    expect(v?.hinweis).toMatch(/«hans@muster.ch» steht jetzt im Feld «E-Mail», ist aber noch nicht gespeichert/)
  })

  it('hält ein Feld mit nur Leerraum für leer', () => {
    expect(kontaktVorbefuellung(kunde, { feld: 'phone_landline', wert: '081 000 00 00' })?.werte)
      .toEqual({ phone_landline: '081 000 00 00' })
  })

  it('lässt ein ausgefülltes Feld stehen und nennt den Vorschlag', () => {
    const v = kontaktVorbefuellung(kunde, { feld: 'phone', wert: '079 999 99 99' })
    expect(v?.werte).toEqual({})
    expect(v?.eingetragen).toBe(false)
    expect(v?.hinweis).toBe(
      'Vorschlag aus dem Mail-Eingang für «Mobil»: «079 999 99 99». Im Feld steht bereits «079 111 22 33» — '
      + 'es bleibt unverändert, bis du es selbst änderst.',
    )
  })

  it('sagt es schlicht, wenn der Vorschlag schon im Feld steht', () => {
    const v = kontaktVorbefuellung(kunde, { feld: 'phone', wert: '079 111 22 33' })
    expect(v?.werte).toEqual({})
    expect(v?.hinweis).toBe('Vorschlag aus dem Mail-Eingang: «079 111 22 33» steht bereits im Feld «Mobil».')
  })

  it('tut nichts ohne Kunde, ohne Vorschlag, ohne Wert oder bei unbekanntem Feld', () => {
    expect(kontaktVorbefuellung(null, { feld: 'email', wert: 'a@b.ch' })).toBeNull()
    expect(kontaktVorbefuellung(kunde, undefined)).toBeNull()
    expect(kontaktVorbefuellung(kunde, { feld: 'email', wert: '  ' })).toBeNull()
    expect(kontaktVorbefuellung(kunde, { feld: 'notes' as 'email', wert: 'x' })).toBeNull()
    // Kein geerbtes Property als Feld.
    expect(kontaktVorbefuellung(kunde, { feld: 'toString' as 'email', wert: 'x' })).toBeNull()
  })

  it('nennt die Felder wie die Kundenmaske', () => {
    expect(KONTAKT_FELD_LABEL).toEqual({ email: 'E-Mail', phone: 'Mobil', phone_landline: 'Festnetz' })
  })
})
