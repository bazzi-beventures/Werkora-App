// Kontakt-Ergänzung aus dem Mail-Eingang — docs/specs/mail-eingang-triage.md §4.2:
// «Übernehmen öffnet das bestehende Formular, vorbefüllt — kein eigenes
// Schnell-Anlegen.» Pflichtfelder, Validierung und der eine Schreibweg in den
// Kundenstamm sitzen in der Kundenmaske; ein zweiter Weg hätte ein Jahr später
// zwei Wahrheiten.
//
// Vorbefüllt wird **nur ein leeres Feld**. Steht dort schon etwas, bleibt es
// stehen: der Vorschlag hat eine KI aus einer weitergeleiteten Mail gelesen, der
// Wert im Stamm hat jemand im Büro eingetragen. Welcher gilt, entscheidet der
// Mensch vor der Maske — der Hinweis nennt ihm dafür beide.

import type { Customer } from '../../api/admin/customers'

/** Die drei Kontaktfelder, die ein Vorschlag ergänzen darf (Server: `KONTAKT_FELDER`). */
export type KontaktFeld = 'email' | 'phone' | 'phone_landline'

export interface KontaktErgaenzung {
  feld: KontaktFeld
  /** Der vorgeschlagene Wert — Fremdtext aus der Mail. */
  wert: string
}

/** Wie das Feld in der Kundenmaske heisst — der Hinweis soll dieselben Wörter tragen. */
export const KONTAKT_FELD_LABEL: Record<KontaktFeld, string> = {
  email: 'E-Mail',
  phone: 'Mobil',
  phone_landline: 'Festnetz',
}

export interface KontaktVorbefuellung {
  /** Startwerte der Maske — nur das eine Feld, und nur, wenn es leer war. */
  werte: Partial<Record<KontaktFeld, string>>
  /** Was über der Maske steht. */
  hinweis: string
  /** Der Wert steht jetzt im Feld (sonst: das Feld war schon ausgefüllt). */
  eingetragen: boolean
}

/**
 * Was die Kundenmaske aus einer Ergänzung macht — `null`, wenn es nichts zu
 * ergänzen gibt (kein Kunde, kein oder leerer Vorschlag, unbekanntes Feld).
 */
export function kontaktVorbefuellung(
  kunde: Pick<Customer, KontaktFeld> | null | undefined,
  ergaenzung: KontaktErgaenzung | null | undefined,
): KontaktVorbefuellung | null {
  const wert = ergaenzung?.wert?.trim() ?? ''
  if (!kunde || !ergaenzung || !wert) return null
  // Nur die drei bekannten Felder — und kein geerbtes Property als «Feld».
  if (!Object.prototype.hasOwnProperty.call(KONTAKT_FELD_LABEL, ergaenzung.feld)) return null
  const label = KONTAKT_FELD_LABEL[ergaenzung.feld]
  const bestehend = (kunde[ergaenzung.feld] ?? '').trim()
  if (!bestehend) {
    return {
      werte: { [ergaenzung.feld]: wert },
      eingetragen: true,
      hinweis: `Vorschlag aus dem Mail-Eingang: «${wert}» steht jetzt im Feld «${label}», ist aber noch nicht `
        + 'gespeichert. Bitte prüfen — der Wert wurde aus einer weitergeleiteten E-Mail gelesen.',
    }
  }
  if (bestehend === wert) {
    return {
      werte: {},
      eingetragen: false,
      hinweis: `Vorschlag aus dem Mail-Eingang: «${wert}» steht bereits im Feld «${label}».`,
    }
  }
  return {
    werte: {},
    eingetragen: false,
    hinweis: `Vorschlag aus dem Mail-Eingang für «${label}»: «${wert}». Im Feld steht bereits «${bestehend}» — `
      + 'es bleibt unverändert, bis du es selbst änderst.',
  }
}
