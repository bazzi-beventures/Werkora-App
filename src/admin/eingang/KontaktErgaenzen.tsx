import { useRef, useState } from 'react'
import { getCustomer, type Customer } from '../../api/admin/customers'
import { CustomerFormDialog } from '../operative/CustomerFormDialog'
import type { KontaktFeld } from '../operative/customerErgaenzung'
import { uebernehmenLabel } from './mailEingang'

/**
 * «Kontakt ergänzen» aus dem Mail-Eingang — docs/specs/mail-eingang-triage.md §4.2.
 *
 * Der Knopf schreibt nichts. Er öffnet die **Kundenmaske des Kundenstamms** über
 * dem Eingang, mit dem Vorschlag im passenden Feld (nur, wenn es leer ist).
 * Gespeichert wird dort, auf dem einen Weg in den Kundenstamm; erst danach
 * meldet `onGespeichert` dem Vorschlag, dass er bestätigt werden kann. Wer
 * abbricht, hat nichts verändert — der Vorschlag bleibt offen.
 *
 * Der Vorschlagswert reist nur als Prop mit; nichts davon wird abgelegt.
 */

interface Props {
  customerId: string | number
  feld: KontaktFeld
  wert: string
  /** Eine andere Aktion am Vorschlag läuft — der Knopf ist gesperrt. */
  disabled?: boolean
  /** Das Bestätigen nach dem Speichern läuft. */
  bestaetigt?: boolean
  /** Die Kundenmaske wurde gespeichert. */
  onGespeichert: (kunde: Customer) => void
}

export default function KontaktErgaenzen({ customerId, feld, wert, disabled, bestaetigt, onGespeichert }: Props) {
  const [kunde, setKunde] = useState<Customer | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const sperre = useRef(false)

  async function oeffne() {
    if (sperre.current) return
    sperre.current = true
    setLaedt(true)
    setFehler(null)
    try {
      // Frisch geholt, nicht aus dem Vorschlag gebaut: die Maske schickt beim
      // Speichern immer den vollen Stand, und der muss der heutige sein.
      setKunde(await getCustomer(String(customerId)))
    } catch {
      setFehler('Der Kunde liess sich nicht öffnen.')
    } finally {
      sperre.current = false
      setLaedt(false)
    }
  }

  return (
    <>
      <button type="button" className="admin-btn admin-btn-primary admin-btn-sm"
              disabled={disabled || laedt || bestaetigt} onClick={() => void oeffne()}>
        {laedt ? 'Kunde wird geladen…' : uebernehmenLabel('kontakt_ergaenzen', !!bestaetigt)}
      </button>
      {fehler && <span role="alert" className="admin-form-error">{fehler}</span>}
      {kunde && (
        <CustomerFormDialog
          label="Kunde bearbeiten"
          initial={kunde}
          ergaenzung={{ feld, wert }}
          onSave={saved => { setKunde(null); onGespeichert(saved) }}
          onCancel={() => setKunde(null)}
        />
      )}
    </>
  )
}
