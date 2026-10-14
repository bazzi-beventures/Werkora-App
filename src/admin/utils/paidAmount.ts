// Eingegangener Betrag beim «bezahlt»-Markieren (WW-19: Kunde zieht Skonto ab).
//
// Die Rechnung bleibt, was sie ausweist (`total_amount`); was tatsächlich kam,
// steht in `invoices.paid_amount`. Die Umsatzauswertungen lesen
// COALESCE(paid_amount, total_amount) — leer heisst also «voll bezahlt».
// Gegenstück im Backend: services/invoice_work_description.resolve_paid_amount.

const round2 = (n: number) => Math.round(n * 100) / 100

/** Vorbelegung des Feldes: der Rechnungsbetrag, ohne Tausender-Apostroph. */
export function paidAmountDefault(total: number): string {
  return round2(total).toFixed(2)
}

export type PaidAmountCheck =
  | { ok: true; amount: number | null; deduction: number; pct: number }
  | { ok: false; error: string }

/** Prüft die Eingabe gegen den Rechnungsbetrag. `amount: null` = voll bezahlt
 *  (das Backend lässt die Spalte dann leer, wie vor dem Feld). */
export function checkPaidAmount(raw: string, total: number): PaidAmountCheck {
  const text = raw.trim().replace(/['’\s]/g, '').replace(',', '.')
  if (!text) return { ok: true, amount: null, deduction: 0, pct: 0 }
  const value = Number(text)
  if (!Number.isFinite(value)) return { ok: false, error: 'Ungültiger Betrag.' }
  const amount = round2(value)
  if (amount <= 0) return { ok: false, error: 'Der Betrag muss grösser als 0 sein.' }
  const full = round2(total)
  if (amount > full) {
    return { ok: false, error: 'Höher als der Rechnungsbetrag — eine Überzahlung lässt sich hier nicht erfassen.' }
  }
  if (amount === full) return { ok: true, amount: null, deduction: 0, pct: 0 }
  const deduction = round2(full - amount)
  return { ok: true, amount, deduction, pct: full > 0 ? (deduction / full) * 100 : 0 }
}

/** Abzug einer bezahlten Rechnung für die Anzeige — null, wenn voll bezahlt. */
export function paidDeduction(inv: { total_amount: number; paid_amount?: number | null }): number | null {
  if (inv.paid_amount == null) return null
  const d = round2(inv.total_amount - inv.paid_amount)
  return d > 0 ? d : null
}
