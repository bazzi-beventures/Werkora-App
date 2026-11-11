import { EmailRow } from './EmailRow'

/** CC-Adressen eines Versand-Dialogs, wie sie an den Server und in die Meldung
 *  gehen: getrimmt, ohne die leeren Zeilen, die «+ CC» anlegt. Die fachliche
 *  Bereinigung (Doppelte, Header-Injection) macht der Server. */
export function cleanCcList(list: string[]): string[] {
  return list.map(a => a.trim()).filter(Boolean)
}

/** «an x (CC: a, b)» — Empfänger-Teil der Erfolgsmeldung nach dem Versand. */
export function recipientSummary(email: string, cc: string[]): string {
  const clean = cleanCcList(cc)
  return clean.length ? `${email} (CC: ${clean.join(', ')})` : email
}

// CC-Zeilen unter dem Empfängerfeld: leer, bis jemand auf «+ CC» klickt. Geteilt
// von der Auftragsbestätigung (SendQuoteMailDialog) und dem Rechnungsversand
// (WW-78) — beide schicken ein echtes CC in derselben Mail.
export function CcEmailRows({ value, onChange, disabled }: {
  value: string[]
  onChange: (next: string[]) => void
  disabled: boolean
}) {
  return (
    <>
      {value.map((v, i) => (
        <EmailRow
          key={`cc-${i}`}
          value={v}
          label={`CC ${i + 1}`}
          prefix="CC"
          disabled={disabled}
          onChange={next => onChange(value.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={disabled}
          onClick={() => onChange([...value, ''])}
        >
          + CC
        </button>
      </div>
    </>
  )
}
