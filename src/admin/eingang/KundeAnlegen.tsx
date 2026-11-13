import { useRef, useState } from 'react'
import { getCustomer, type Customer } from '../../api/admin/customers'
import type { KundeAnlegenPayload } from '../../api/admin/mailEingang'
import { CustomerFormDialog } from '../operative/CustomerFormDialog'
import { ergaenzungFuerKandidat, kandidatText, kundePrefill, uebernehmenLabel } from './mailEingang'

/**
 * «Kunde anlegen» aus dem Mail-Eingang — docs/specs/mail-eingang-triage.md §4.1.
 *
 * Wie «Kontakt ergänzen» schreibt der Knopf nichts selbst: er öffnet die
 * **Kundenmaske des Kundenstamms**, vorbefüllt mit dem, was in der Mail stand.
 * Gespeichert wird dort (Pflichtfelder, Validierung, Namens-Hinweis); erst danach
 * meldet `onGespeichert`, welcher Kunde es geworden ist.
 *
 * Zuerst kommen die möglichen Dubletten: gibt es den Absender schon (gleiche
 * Nummer, ähnlicher Name), öffnet «Ist dieser Kunde» dessen Maske, mit dem
 * Kontakt aus der Mail im leeren Feld — statt eines zweiten Kunden.
 */

interface Props {
  payload: KundeAnlegenPayload
  disabled?: boolean
  /** Das Bestätigen nach dem Speichern läuft. */
  bestaetigt?: boolean
  onGespeichert: (kunde: Customer) => void
}

type Offen = { art: 'neu' } | { art: 'bestehend'; kunde: Customer }

export default function KundeAnlegen({ payload, disabled, bestaetigt, onGespeichert }: Props) {
  const [offen, setOffen] = useState<Offen | null>(null)
  const [laedt, setLaedt] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const sperre = useRef(false)
  const kandidaten = payload.kandidaten ?? []
  const gesperrt = disabled || bestaetigt || laedt !== null

  async function waehle(id: string) {
    if (sperre.current) return
    sperre.current = true
    setLaedt(id)
    setFehler(null)
    try {
      // Frisch geholt: die Maske schickt beim Speichern den vollen Stand.
      setOffen({ art: 'bestehend', kunde: await getCustomer(id) })
    } catch {
      setFehler('Der Kunde liess sich nicht öffnen.')
    } finally {
      sperre.current = false
      setLaedt(null)
    }
  }

  function gespeichert(kunde: Customer) {
    setOffen(null)
    onGespeichert(kunde)
  }

  return (
    <>
      {kandidaten.length > 0 && (
        <div className="eingang-hinweis eingang-feld-breit" role="status">
          <div>Gibt es den Absender schon? Mögliche Treffer im Kundenstamm:</div>
          <ul className="eingang-kandidaten">
            {kandidaten.map(k => (
              <li key={k.id}>
                <span>{kandidatText(k)}</span>{' '}
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                        disabled={gesperrt} onClick={() => void waehle(k.id)}>
                  {laedt === k.id ? 'Wird geladen…' : 'Ist dieser Kunde'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="admin-btn admin-btn-primary admin-btn-sm"
              disabled={gesperrt} onClick={() => setOffen({ art: 'neu' })}>
        {uebernehmenLabel('kunde_anlegen', !!bestaetigt)}
      </button>
      {fehler && <span role="alert" className="admin-form-error">{fehler}</span>}
      {offen?.art === 'neu' && (
        <CustomerFormDialog
          label="Neuer Kunde"
          initial={null}
          prefill={kundePrefill(payload)}
          onSave={gespeichert}
          onCancel={() => setOffen(null)}
        />
      )}
      {offen?.art === 'bestehend' && (
        <CustomerFormDialog
          label="Kunde bearbeiten"
          initial={offen.kunde}
          ergaenzung={ergaenzungFuerKandidat(payload)}
          onSave={gespeichert}
          onCancel={() => setOffen(null)}
        />
      )}
    </>
  )
}
