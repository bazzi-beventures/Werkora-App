import type { Customer } from '../../../api/admin/customers'
import { CustomerFormDialog } from '../CustomerFormDialog'
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
// Das Fenster selbst (Overlay, «Klick daneben schliesst nicht») steht in
// CustomerFormDialog — dieselbe Maske geht auch über dem Mail-Eingang auf.

interface Props {
  /** Was im Kundenfeld getippt war ('' = nichts). */
  query: string
  onCreated: (customer: Customer) => void
  onCancel: () => void
}

export function NewCustomerDialog({ query, onCreated, onCancel }: Props) {
  return (
    <CustomerFormDialog
      label="Neuer Kunde"
      initial={null}
      prefill={customerPrefillFromQuery(query)}
      onSave={onCreated}
      onCancel={onCancel}
    />
  )
}
