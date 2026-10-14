import { fmtCHF } from '../utils/format'
import { checkPaidAmount } from '../utils/paidAmount'

/** Feld «Eingegangener Betrag» im Bezahlt-Dialog — Rechnungsübersicht und
 *  Projekt-Reiter teilen es, damit beide dasselbe prüfen und anzeigen. */
export function PaidAmountField({ id, value, total, onChange }: {
  id: string
  value: string
  total: number
  onChange: (value: string) => void
}) {
  const check = checkPaidAmount(value, total)
  return (
    <div style={{ margin: '12px 0' }}>
      <label className="admin-form-label" htmlFor={id}>Eingegangener Betrag (CHF)</label>
      <input
        id={id}
        className="admin-form-input"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <div style={{ fontSize: 12, color: check.ok ? 'var(--muted)' : 'var(--danger)', marginTop: 4 }}>
        {!check.ok
          ? check.error
          : check.deduction > 0
            ? `Abzug ${fmtCHF(check.deduction)} (${check.pct.toFixed(1)} %) — z. B. Skonto. Die Rechnung gilt als bezahlt; in den Auswertungen zählt der eingegangene Betrag.`
            : 'Weniger erhalten, etwa weil der Kunde Skonto abgezogen hat? Hier den tatsächlichen Betrag eintragen.'}
      </div>
    </div>
  )
}
