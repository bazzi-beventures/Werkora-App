import { backdropCloseProps } from '../../shared/backdropClose'
import type { Customer } from '../../api/admin/customers'
import { CustomerForm } from './CustomerForm'
import type { KontaktErgaenzung } from './customerErgaenzung'
import type { CustomerPrefill } from './customerPrefill'

// Die Kundenmaske des Kundenstamms als Fenster über einem anderen Screen.
//
// Zwei Aufrufer, ein Overlay:
// - «+ Neuen Kunden anlegen» im Kundenfeld der Projektmaske (WW-71,
//   projectDetail/NewCustomerDialog.tsx) — neuer Kunde, vorbelegt mit dem Suchtext.
// - «Kontakt ergänzen» im Mail-Eingang (docs/specs/mail-eingang-triage.md §4.2,
//   eingang/KontaktErgaenzen.tsx) — bestehender Kunde, ein leeres Kontaktfeld
//   vorbefüllt.
//
// Es ist in beiden Fällen dieselbe Maske mit denselben Feldern, derselben
// Validierung und demselben Speicherweg (`saveCustomer`) — der Grund, warum es
// keinen zweiten, schlankeren Weg in den Kundenstamm gibt.
//
// Ein Klick neben das Fenster schliesst es nicht: die Maske hat ein Dutzend
// Felder, und ein verrutschter Klick soll sie nicht leeren. Zu geht es über
// «Abbrechen» oder das Speichern.

interface Props {
  /** Name des Fensters für Screenreader («Neuer Kunde», «Kunde bearbeiten»). */
  label: string
  /** `null` = neuer Kunde. */
  initial: Customer | null
  /** Nur neuer Kunde: Startwerte aus dem Suchtext. */
  prefill?: CustomerPrefill
  /** Nur bestehender Kunde: Kontakt-Vorschlag aus dem Mail-Eingang. */
  ergaenzung?: KontaktErgaenzung
  /** Der gespeicherte Kunde, wie der Server ihn zurückgibt. */
  onSave: (saved: Customer) => void
  onCancel: () => void
}

export function CustomerFormDialog({ label, initial, prefill, ergaenzung, onSave, onCancel }: Props) {
  return (
    <div
      className="admin-confirm-overlay"
      {...backdropCloseProps(onCancel, { blockWhen: () => true })}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="admin-confirm-box" style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}>
        <CustomerForm
          initial={initial}
          prefill={prefill}
          ergaenzung={ergaenzung}
          variant="dialog"
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  )
}
