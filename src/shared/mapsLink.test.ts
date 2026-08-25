import { describe, it, expect } from 'vitest'
import { mapsUrl } from './mapsLink'

describe('mapsUrl', () => {
  it('baut einen Google-Maps-Suchlink', () => {
    expect(mapsUrl('Bahnhofstrasse 1, 8001 Zürich')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Bahnhofstrasse%201%2C%208001%20Z%C3%BCrich'
    )
  })

  it('faltet Zeilenumbrüche zu Leerzeichen — sonst findet Maps nichts', () => {
    expect(mapsUrl('Musterweg 3\n6000 Luzern')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Musterweg%203%206000%20Luzern'
    )
  })

  it('gibt für leere Adressen null zurück (kein toter Link)', () => {
    expect(mapsUrl('')).toBeNull()
    expect(mapsUrl('   ')).toBeNull()
    expect(mapsUrl(null)).toBeNull()
    expect(mapsUrl(undefined)).toBeNull()
  })
})
