import { fmtCHF } from '../utils/format'
import { checkPaidAmount, paidNote } from '../utils/paidAmount'

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
          : check.overpayment > 0
            ? `Überzahlung ${fmtCHF(check.overpayment)}. Die Rechnung gilt als bezahlt; in den Auswertungen zählt der Rechnungsbetrag. Der Mehrbetrag wird separat vermerkt — zurückerstatten oder verrechnen.`
            : check.deduction > 0
              ? `Abzug ${fmtCHF(check.deduction)} (${check.pct.toFixed(1)} %) — z. B. Skonto. Die Rechnung gilt als bezahlt; in den Auswertungen zählt der eingegangene Betrag.`
              : 'Mehr oder weniger erhalten, etwa wegen Skonto? Hier den tatsächlichen Betrag eintragen.'}
      </div>
    </div>
  )
}

/** Abweichung vom Rechnungsbetrag in den Listen (Rechnungsübersicht, Projekt-Reiter):
 *  weniger erhalten (Skonto) oder Überzahlung (Guthaben des Kunden, farbig). */
export function PaidNote({ invoice, block = false, prefix = '' }: {
  invoice: { total_amount: number; paid_amount?: number | null; ueberzahlung?: number | null }
  block?: boolean
  prefix?: string
}) {
  const note = paidNote(invoice)
  if (!note) return null
  const style = {
    fontWeight: 400, fontSize: 12,
    color: invoice.ueberzahlung ? 'var(--warning-ink)' : 'var(--muted)',
  }
  return block
    ? <div style={style} title={note.title}>{note.text}</div>
    : <span style={style} title={note.title}>{prefix}{note.text}</span>
}
