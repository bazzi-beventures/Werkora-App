// Vorbelegung des neuen Kunden aus dem Suchtext des Kundenfelds (WW-71).
//
// Wer in der Projektmaske «Muster» sucht und keinen Treffer bekommt, legt
// genau diesen Kunden an — der Suchtext soll deshalb nicht verloren gehen.
// Die Kundensuche (CustomerCombobox) findet auch über E-Mail und Telefon;
// dementsprechend landet eine getippte Adresse bzw. Nummer im passenden Feld
// statt im Namen.
//
// Bewusst grob, und nie geraten: was weder eindeutig E-Mail noch eindeutig
// Telefonnummer ist, wird als Name übernommen — und zwar ungeteilt ins Feld
// «Nachname / Bezeichnung». Ob «Hans Muster» Vor- plus Nachname ist oder
// «Muster Hans», weiss nur, wer den Kunden kennt; die Maske bietet dafür die
// Aufteilung an (customerNameParts.suggestNameSplits).

export interface CustomerPrefill {
  last_name?: string
  email?: string
  phone?: string
  phone_landline?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Ziffern mit den üblichen Trennern — «079 576 55 16», «+41 79 576 55 16», «044/123 45 67».
const PHONE = /^\+?[\d\s/().-]+$/

/** Schweizer Mobilnummer (07x), national oder mit Landesvorwahl. */
function isMobile(digits: string): boolean {
  return /^(07|417|00417)/.test(digits)
}

export function customerPrefillFromQuery(query: string): CustomerPrefill {
  const q = query.trim().replace(/\s+/g, ' ')
  if (!q) return {}
  if (EMAIL.test(q)) return { email: q }
  const digits = q.replace(/\D+/g, '')
  if (PHONE.test(q) && digits.length >= 6) {
    return isMobile(digits) ? { phone: q } : { phone_landline: q }
  }
  return { last_name: q }
}
