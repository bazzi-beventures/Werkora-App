// Werkora-Bonus-Dashboard (superadmin-only) — Spec docs/specs/werkora-bonus.md §6.
//
// Der Name "Werkora Bonus" ist rein intern und erscheint nie auf einem
// Kundendokument; auf dem Beleg steht die konfigurierte `position_label`.

import { apiFetch } from '../client'

export interface WerkoraBonusKennzahlen {
  /** Σ Aufschlag über die im Zeitraum versendeten Rechnungen (netto, CHF). */
  realisiert: number
  /** Davon auf Rechnungen mit Status `bezahlt`. */
  bezahlt: number
  /** Σ Aufschlag über die noch offenen Offerten des Zeitraums. */
  offeriert_offen: number
  belege_mit_bonus: number
  /** null = keine Belege mit Bonus im Zeitraum (UI zeigt „—", nicht 0). */
  durchschnitt_pro_beleg: number | null
  /** Belege mit Bonus / Belege über der Schwelle. null = nichts zu messen. */
  trefferquote_pct: number | null
  anteil_netto_umsatz_pct: number | null
  netto_umsatz: number
}

export interface WerkoraBonusMonat {
  monat: string          // YYYY-MM
  offeriert: number
  realisiert: number
}

export interface WerkoraBonusBeleg {
  art: 'offerte' | 'rechnung'
  nummer: string
  datum: string          // YYYY-MM-DD
  kunde: string
  projekt: string
  /** Brutto-Total VOR dem Aufschlag — die Zahl, die „warum steht da 5'588?" beantwortet. */
  basis_brutto: number
  bonus: number
  end_brutto: number
  status: string
}

export interface WerkoraBonusResponse {
  von: string
  bis: string
  /** false = Feature beim Mandanten aus oder unbrauchbar konfiguriert. */
  aktiv: boolean
  konfiguration: {
    schwelle_chf: number | null
    raster_chf: number | null
    ziel_von: number | null
    ziel_bis: number | null
    position_label: string | null
  }
  kennzahlen: WerkoraBonusKennzahlen
  monate: WerkoraBonusMonat[]
  belege: WerkoraBonusBeleg[]
}

export async function getWerkoraBonus(von: string, bis: string): Promise<WerkoraBonusResponse> {
  const q = new URLSearchParams({ von, bis })
  return apiFetch<WerkoraBonusResponse>(`/pwa/admin/werkora-bonus?${q}`)
}
