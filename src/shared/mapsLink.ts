// Adresse → Kartenlink. Der Monteur soll die Baustellenadresse antippen und direkt
// in der Navigation landen, statt sie abzutippen.
//
// Bewusst die universelle Google-Maps-Such-URL statt `geo:` oder `maps://`: sie
// öffnet auf Android die Maps-App, auf iOS Google Maps (falls installiert) bzw. den
// Browser, und funktioniert am Desktop ebenfalls. Ein `geo:`-Link führt im Desktop-
// Browser ins Leere.
const MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query='

/** Kartenlink zu einer Adresse — null, wenn nichts Brauchbares drinsteht. */
export function mapsUrl(address: string | null | undefined): string | null {
  const q = (address ?? '').trim()
  if (!q) return null
  // Zeilenumbrüche aus mehrzeiligen Adressfeldern werden zu Leerzeichen, sonst
  // landet der Umbruch encodiert in der Query und Maps findet nichts.
  return MAPS_SEARCH_URL + encodeURIComponent(q.replace(/\s+/g, ' '))
}
