// Eingegangener Betrag beim «bezahlt»-Markieren (WW-19: Kunde zieht Skonto ab).
//
// Die Rechnung bleibt, was sie ausweist (`total_amount`); was tatsächlich kam,
// steht in `invoices.paid_amount`. Die Umsatzauswertungen lesen
// COALESCE(paid_amount, total_amount) — leer heisst also «voll bezahlt».
// Zahlt der Kunde zu viel (WS-49), bleibt paid_amount leer und nur der
// Mehrbetrag steht in `invoices.ueberzahlung`: Guthaben des Kunden, kein Umsatz.
// Gegenstück im Backend: services/invoice_work_description.resolve_paid_amount.

import { fmtCHF } from './format'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Vorbelegung des Feldes: der Rechnungsbetrag, ohne Tausender-Apostroph. */
export function paidAmountDefault(total: number): string {
  return round2(total).toFixed(2)
}

export type PaidAmountCheck =
  | { ok: true; amount: number | null; deduction: number; pct: number; overpayment: number }
  | { ok: false; error: string }

/** Prüft die Eingabe gegen den Rechnungsbetrag. `amount: null` = voll bezahlt
 *  (das Backend lässt die Spalte dann leer, wie vor dem Feld). Bei einer
 *  Überzahlung geht der eingegebene Betrag ans Backend, das ihn aufteilt;
 *  `overpayment` ist der Mehrbetrag für die Anzeige. */
export function checkPaidAmount(raw: string, total: number): PaidAmountCheck {
  const text = raw.trim().replace(/['’\s]/g, '').replace(',', '.')
  const voll = { ok: true as const, amount: null, deduction: 0, pct: 0, overpayment: 0 }
  if (!text) return voll
  const value = Number(text)
  if (!Number.isFinite(value)) return { ok: false, error: 'Ungültiger Betrag.' }
  const amount = round2(value)
  if (amount <= 0) return { ok: false, error: 'Der Betrag muss grösser als 0 sein.' }
  const full = round2(total)
  if (amount === full) return voll
  if (amount > full) return { ...voll, amount, overpayment: round2(amount - full) }
  const deduction = round2(full - amount)
  return { ok: true, amount, deduction, pct: full > 0 ? (deduction / full) * 100 : 0, overpayment: 0 }
}

/** Zusatz in der Rechnungsliste hinter dem Betrag: was vom Rechnungsbetrag
 *  abweicht — weniger erhalten (Skonto) oder zu viel (Guthaben des Kunden). */
export function paidNote(inv: { total_amount: number; paid_amount?: number | null; ueberzahlung?: number | null }):
  { text: string; title: string } | null {
  if (inv.ueberzahlung != null && inv.ueberzahlung > 0) {
    return {
      text: `Überzahlung ${fmtCHF(inv.ueberzahlung)}`,
      title: 'Kunde hat mehr bezahlt als verrechnet — Mehrbetrag zurückerstatten oder verrechnen. Kein Umsatz.',
    }
  }
  if (paidDeduction(inv) != null) {
    return { text: `erhalten ${fmtCHF(inv.paid_amount!)}`, title: 'Weniger eingegangen als verrechnet (z. B. Skonto)' }
  }
  return null
}

/** Abzug einer bezahlten Rechnung für die Anzeige — null, wenn voll bezahlt. */
export function paidDeduction(inv: { total_amount: number; paid_amount?: number | null }): number | null {
  if (inv.paid_amount == null) return null
  const d = round2(inv.total_amount - inv.paid_amount)
  return d > 0 ? d : null
}
