// Anzahlung im Erstellen-Dialog (WW-47, Spec docs/specs/anzahlung-und-rapportauswahl.md
// §3): Prozentsatz oder Betrag einer neuen Anzahlungsrechnung, und auf jeder anderen
// Rechnung die Wahl, welche offenen Anzahlungen sie abzieht.

import type { OpenAnzahlung } from '../../api/admin/invoices'
import type { AnzahlungEingabe } from '../utils/invoiceMode'
import { fmtCHF, fmtDate } from '../utils/format'

export function AnzahlungField({ value, onChange, invalid, disabled, idPrefix }: {
  value: AnzahlungEingabe
  onChange: (next: AnzahlungEingabe) => void
  invalid: boolean
  disabled?: boolean
  idPrefix: string
}) {
  // Prozent oder fester Betrag (WS-41): «Akonto Fr. 9'953.30» trifft ein Satz nie
  // auf den Rappen. Der Betrag ist inkl. MWST, so steht er in der Abmachung.
  const isBetrag = value.art === 'betrag'
  const id = `${idPrefix}-anzahlung-${isBetrag ? 'betrag' : 'pct'}`
  const art = (next: AnzahlungEingabe['art']) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
      <input
        type="radio"
        name={`${idPrefix}-anzahlung-art`}
        checked={value.art === next}
        disabled={disabled}
        onChange={() => onChange({ ...value, art: next })}
      />
      {next === 'pct' ? 'Prozent' : 'Betrag'}
    </label>
  )
  return (
    <div style={{ marginBottom: 12 }}>
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 6px', display: 'flex', gap: 16 }}>
        <legend className="admin-form-label">Anzahlung als</legend>
        {art('pct')}
        {art('betrag')}
      </fieldset>
      <label className="admin-form-label" htmlFor={id}>
        {isBetrag ? 'Anzahlung in CHF (inkl. MWST)' : 'Anzahlung in %'}
      </label>
      <input
        key={id}
        id={id}
        className="admin-form-input"
        inputMode="decimal"
        value={isBetrag ? value.betrag : value.pct}
        placeholder={isBetrag ? "z. B. 9'953.30" : undefined}
        onChange={e => onChange(isBetrag ? { ...value, betrag: e.target.value } : { ...value, pct: e.target.value })}
        disabled={disabled}
        style={{ maxWidth: isBetrag ? 160 : 120 }}
      />
      {invalid ? (
        <div className="admin-form-error" role="alert">
          {isBetrag
            ? 'Bitte einen Betrag in CHF eingeben, auf 5 Rappen genau.'
            : 'Bitte einen Wert zwischen 0 und 100 eingeben.'}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {isBetrag
            ? 'So steht der Betrag auf der Anzahlungsrechnung; er muss unter dem Total der Offerte liegen.'
            : 'Vom Netto der Offerte (nach Rabatten), zzgl. MWST.'}
        </div>
      )}
    </div>
  )
}

export function AnzahlungAbzugField({ anzahlungen, checked, onChange, disabled }: {
  anzahlungen: OpenAnzahlung[]
  checked: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const checkedSet = new Set(checked)
  function toggle(id: number) {
    onChange(checkedSet.has(id) ? checked.filter(c => c !== id) : [...checked, id])
  }
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
      <legend className="admin-form-label">Anzahlung abziehen</legend>
      {anzahlungen.map(a => (
        <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={checkedSet.has(a.id)} disabled={disabled} onChange={() => toggle(a.id)} />
          <span>
            {a.invoice_number} vom {fmtDate(a.created_at)}
            {a.anzahlung_pct ? ` (${a.anzahlung_pct.toLocaleString('de-CH')} %)` : ''}
            {' — '}{fmtCHF(a.total_amount)}
          </span>
        </label>
      ))}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        Die Rechnung zeigt das volle Total und zieht die Anzahlung inkl. MWST ab; der
        Einzahlungsschein lautet auf den Restbetrag.
      </div>
    </fieldset>
  )
}
