// Beschriftungen und Lesehelfer über der Projekt-Antwort.
//
// Die Typen selbst stehen seit Charge H1 in api/admin/projects.ts; hier liegt,
// was reine Darstellung ist — vorher lag beides im ProjectsScreen und wurde von
// sechs anderen Screens von dort importiert.

import type { EmbeddedCustomer } from '../../api/admin/projects'

// Die Beschriftungen teilt sich die Verwaltung mit der Monteur-PWA (Charge H5).
export { PROJECT_KIND_LABELS } from '../../shared/projectDetail/types'

/** Rechnungsname vor Kundenname — so steht es auch auf Offerte und Rechnung. */
export function projectCustomerName(p: { customer?: EmbeddedCustomer | null }): string {
  const c = p.customer
  return c?.billing_name || c?.name || ''
}

export function projectCustomerEmail(p: { customer?: EmbeddedCustomer | null }): string {
  return p.customer?.email || ''
}

/** Rechnungsadresse vor Standardadresse. */
export function projectBillingAddress(p: { customer?: EmbeddedCustomer | null }): string {
  const c = p.customer
  return c?.billing_address || c?.address || ''
}
