// Lieferanten: Liste, Stammdaten und die Firmen-Suche fürs Formular.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface Supplier {
  id: string
  name: string
  // Drei Zeichen, geht in die Artikelnummer ein (z.B. "GRI").
  prefix: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  street?: string | null
  zip?: string | null
  city?: string | null
  notes?: string | null
}

// Treffer der Firmen-Suche (Handelsregister/Web) — füllt das Formular vor und ist
// kein gespeicherter Lieferant.
export interface SupplierLookupHit {
  name: string
  street: string
  zip: string
  city: string
  phone: string
  email: string
  website: string
  occupation: string
}

export type SupplierInput = Omit<Supplier, 'id'>

export async function listSuppliers(): Promise<Supplier[]> {
  return apiFetch<Supplier[]>('/pwa/admin/suppliers')
}

export async function lookupSuppliers(query: string): Promise<SupplierLookupHit[]> {
  return apiFetch<SupplierLookupHit[]>(`/pwa/admin/suppliers/lookup?q=${encodeURIComponent(query)}`)
}

/** Ohne `id` anlegen, mit `id` ändern. */
export async function saveSupplier(input: SupplierInput, id?: string): Promise<void> {
  await apiFetch(id ? `/pwa/admin/suppliers/${id}` : '/pwa/admin/suppliers', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

/** Löscht den Lieferanten samt zugehörigen Preisregeln (serverseitig). */
export async function deleteSupplier(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/suppliers/${id}`, { method: 'DELETE' })
}
