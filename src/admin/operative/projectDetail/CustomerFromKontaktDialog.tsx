import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { saveCustomer } from '../../../api/admin/customers'
import type { Customer } from '../../../api/admin/customers'
import type { Kontakt } from '../../../api/admin/projects'
import { customerInputFromKontakt } from './kontaktKundenstamm'

// Nachfrage nach dem Speichern der Projektmaske: frei erfasste Ansprechpersonen
// (ohne Treffer im Kundenstamm) als Kunden anlegen?
//
// Das Projekt ist an dieser Stelle bereits gespeichert — der Dialog hält nur
// noch den Absprung in die Übersicht bzw. ins neue Projekt auf. «Nein» ist
// deshalb folgenlos, und ein Fehler beim Anlegen lässt sich hier wiederholen
// oder überspringen, ohne dass Projektdaten verloren gehen.

interface Props {
  kontakte: Kontakt[]
  /** Projekt hat noch keinen Kunden → der neue wird verknüpft (Hinweis im Text). */
  projectHasCustomer: boolean
  /**
   * Kunden sind angelegt; der Aufrufer verknüpft sie mit dem Projekt. Wirft er,
   * bleibt der Dialog mit der Fehlermeldung offen.
   */
  onCreated: (created: Customer[]) => Promise<void>
  onSkip: () => void
}

export function CustomerFromKontaktDialog({ kontakte, projectHasCustomer, onCreated, onSkip }: Props) {
  // Bei mehreren Personen darf der Anwender abwählen — vorbelegt sind alle.
  const [selected, setSelected] = useState<boolean[]>(() => kontakte.map(() => true))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const multiple = kontakte.length > 1
  const chosen = kontakte.filter((_, i) => selected[i])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const created: Customer[] = []
      for (const k of chosen) created.push(await saveCustomer(customerInputFromKontakt(k)))
      await onCreated(created)
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Kunde konnte nicht angelegt werden.')
      setBusy(false)
    }
  }

  const first = kontakte[0]
  return (
    <ConfirmDialog
      title={multiple ? 'Kunden im Kundenstamm anlegen?' : 'Kunde im Kundenstamm anlegen?'}
      message={multiple
        ? <>Diese Ansprechpersonen sind noch nicht im Kundenstamm. Sollen sie jetzt als Kunden angelegt werden?</>
        : <><strong>{first?.name}</strong> ist noch nicht im Kundenstamm. Soll die Ansprechperson jetzt als Kunde angelegt werden?</>}
      warning={error}
      confirmLabel={multiple ? 'Ja, Kunden anlegen' : 'Ja, Kunde anlegen'}
      cancelLabel="Nein"
      busy={busy}
      busyLabel="Anlegen…"
      confirmDisabled={chosen.length === 0}
      onConfirm={confirm}
      onCancel={onSkip}
    >
      {multiple && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {kontakte.map((k, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected[i]}
                disabled={busy}
                onChange={e => setSelected(prev => prev.map((v, idx) => idx === i ? e.target.checked : v))}
              />
              <span>
                <strong>{k.name}</strong>
                {k.telefon ? <span style={{ color: 'var(--muted)' }}> · {k.telefon}</span> : null}
                {k.email ? <span style={{ color: 'var(--muted)' }}> · {k.email}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
        Übernommen werden Name, Telefon und E-Mail — Adresse und Rechnungsangaben lassen sich im Kundenstamm ergänzen.
        {!projectHasCustomer && (
          <> Das Projekt hat noch keinen Kunden und wird mit dem neuen Kunden verknüpft.</>
        )}
      </div>
    </ConfirmDialog>
  )
}
