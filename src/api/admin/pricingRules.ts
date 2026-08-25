// Preisregeln: Aufschlag % je Lieferant (optional je Kategorie).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface PricingRule {
  id: string
  supplier_id: string
  markup_pct: number
  // null = gilt für alle Kategorien dieses Lieferanten.
  category: string | null
  // Eingebettet aus der Lieferantentabelle (PostgREST-Join).
  suppliers: { name: string; prefix: string } | null
}

export interface PricingRuleInput {
  // Der Endpoint identifiziert den Lieferanten über den Namen, nicht die id.
  supplier_name: string
  category: string | null
  markup_pct: number
}

export async function listPricingRules(): Promise<PricingRule[]> {
  return apiFetch<PricingRule[]>('/pwa/admin/pricing-rules')
}

/** Ohne `id` anlegen, mit `id` ändern. */
export async function savePricingRule(input: PricingRuleInput, id?: string): Promise<void> {
  await apiFetch(id ? `/pwa/admin/pricing-rules/${id}` : '/pwa/admin/pricing-rules', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

export async function deletePricingRule(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/pricing-rules/${id}`, { method: 'DELETE' })
}
