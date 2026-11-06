import { backdropCloseProps } from '../../../shared/backdropClose'
import type { Customer } from '../../../api/admin/customers'
import { CustomerForm } from '../CustomerForm'
import { customerPrefillFromQuery } from '../customerPrefill'

// «+ Neuen Kunden anlegen» aus dem Kundenfeld der Projektmaske (WW-71).
//
// Vorher hiess ein neuer Kunde: Projekt ohne Kunden speichern, in den
// Kundenstamm wechseln, Kunden erfassen, das Projekt wieder suchen und den
// Kunden dort wählen. Jetzt geht die Kundenmaske des Kundenstamms über dem
// Projekt auf; gespeichert wird der Kunde sofort (er gehört dem Stamm, nicht
// dem Projekt), gewählt wird er im Projekt wie jeder andere — ein neues
// Projekt bleibt dabei ungespeichert, bis man es selbst speichert.
//
// Ein Klick neben das Fenster schliesst es nicht: die Maske hat ein Dutzend
// Felder, und ein verrutschter Klick soll sie nicht leeren. Zu geht es über
// «Abbrechen» oder das Anlegen.

interface Props {
  /** Was im Kundenfeld getippt war ('' = nichts). */
  query: string
  onCreated: (customer: Customer) => void
  onCancel: () => void
}

export function NewCustomerDialog({ query, onCreated, onCancel }: Props) {
  return (
    <div
      className="admin-confirm-overlay"
      {...backdropCloseProps(onCancel, { blockWhen: () => true })}
      role="dialog"
      aria-modal="true"
      aria-label="Neuer Kunde"
    >
      <div className="admin-confirm-box" style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}>
        <CustomerForm
          initial={null}
          prefill={customerPrefillFromQuery(query)}
          variant="dialog"
          onSave={onCreated}
          onCancel={onCancel}
        />
      </div>
    </div>
  )
}
