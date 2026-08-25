// Kunden: Liste, Stammdaten, Dubletten-Check und Kommentare.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.
//
// `Customer` lag bis Charge H1 im CustomersScreen und wurde von drei anderen
// Screens von dort importiert (Screen → Screen, an der Schichtgrenze vorbei).
// Der Typ gehört zur API-Antwort und steht deshalb hier.

import { apiFetch } from '../client'

// Weitere Empfänger neben der Haupt-E-Mail (Spec: kunden-mehrere-emails.md).
export interface AdditionalEmail {
  email: string
  label: string | null
}

// Anrede im Kundenstamm (Migration 20260820b). Gespeichert wird der Schlüssel,
// angezeigt und gedruckt das Label. Die Liste muss zu db.customers.SALUTATION_LABELS
// passen: die Spalte trägt einen CHECK, ein hier erfundener Wert kommt als 400
// zurück. NULL/'' = keine Anrede — der Normalfall bei Firmen und Verwaltungen.
export const SALUTATIONS = [
  { value: 'herr', label: 'Herr' },
  { value: 'frau', label: 'Frau' },
] as const

/** Druckform einer gespeicherten Anrede; unbekannt/leer ergibt '' (Zeile fällt weg). */
export function salutationLabel(value: string | null | undefined): string {
  return SALUTATIONS.find(s => s.value === value)?.label ?? ''
}

// Die Antwort trägt mehr Spalten als hier stehen (z.B. invoice_delivery,
// print_notes) — aufgeführt ist, was die PWA verwendet.
export interface Customer {
  id: string
  name: string
  /** 'herr' | 'frau' | null — Schlüssel, nicht Druckform (siehe salutationLabel). */
  salutation: string | null
  company: string | null
  email: string | null
  additional_emails: AdditionalEmail[] | null
  phone: string | null
  phone_landline: string | null
  address: string | null
  billing_name: string | null
  billing_address: string | null
  object_address: string | null
  local_contact_name: string | null
  local_contact_phone: string | null
  owner_contact_name: string | null
  owner_contact_phone: string | null
  notes: string | null
  created_at: string
}

export interface CustomersListResponse {
  rows: Customer[]
  total: number
  page: number
  page_size: number
}

// Was POST/PATCH schickt. Nur `name` ist Pflicht — serverseitig
// (UpsertCustomerRequest) haben alle anderen Felder einen Default. Das Kunden-
// formular schickt trotzdem alles, damit Leeren wirklich leert; die
// Entwurfs-Umwandlung legt einen Kunden mit vier Feldern an.
export interface CustomerInput {
  name: string
  // null leert die Anrede wieder (dreiwertige PATCH-Semantik im Backend).
  salutation?: string | null
  company?: string | null
  email?: string | null
  // Immer mitsenden (auch []), wenn das Formular sie kennt — sonst kommt das
  // Entfernen aller Zusatzadressen nicht an.
  additional_emails?: AdditionalEmail[]
  phone?: string | null
  phone_landline?: string | null
  address?: string | null
  billing_name?: string | null
  billing_address?: string | null
  object_address?: string | null
  local_contact_name?: string | null
  local_contact_phone?: string | null
  owner_contact_name?: string | null
  owner_contact_phone?: string | null
  notes?: string | null
}

// Treffer des Dubletten-Checks — bewusst schlanker als `Customer`: der Hinweis im
// Formular zeigt nur, wer den Namen schon trägt.
export interface CustomerNameMatch {
  id: string
  name: string
  company: string | null
  address: string | null
  billing_address: string | null
}

export interface CustomerComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
  updated_at?: string | null
}

/**
 * Alle Kunden auf einmal — fuer Auswahlfelder (Projektmaske, Offerte), die den
 * ganzen Stamm im Speicher brauchen. Fuer die Kundenliste selbst ist
 * `listCustomers` da: die blaettert und sucht serverseitig.
 */
export async function getAllCustomers(): Promise<Customer[]> {
  return apiFetch<Customer[]>('/pwa/admin/customers')
}

export async function listCustomers(
  opts: { page: number; pageSize: number; search?: string },
): Promise<CustomersListResponse> {
  const params = new URLSearchParams({ page: String(opts.page), page_size: String(opts.pageSize) })
  if (opts.search) params.set('search', opts.search)
  return apiFetch<CustomersListResponse>(`/pwa/admin/customers/list?${params.toString()}`)
}

/** Ohne `id` anlegen, mit `id` ändern; beide Wege liefern den gespeicherten Kunden zurück. */
export async function saveCustomer(input: CustomerInput, id?: string): Promise<Customer> {
  return apiFetch<Customer>(id ? `/pwa/admin/customers/${id}` : '/pwa/admin/customers', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Alle Kunden in einem Zug (ohne Pagination) — für Auswahllisten. Die
 * Kundenliste selbst nutzt `listCustomers`.
 */
export async function listAllCustomers(): Promise<Customer[]> {
  return apiFetch<Customer[]>('/pwa/admin/customers')
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/customers/${id}`, { method: 'DELETE' })
}

/**
 * Trägt ein anderer Kunde denselben Namen? Rein informativ (das Formular
 * blockiert nicht) — `excludeId` klammert beim Bearbeiten den Kunden selbst aus.
 */
export async function checkCustomerName(name: string, excludeId?: string): Promise<CustomerNameMatch[]> {
  const params = new URLSearchParams({ name })
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await apiFetch<{ matches?: CustomerNameMatch[] }>(`/pwa/admin/customers/name-check?${params}`)
  return res?.matches ?? []
}

export async function getCustomerComments(customerId: string): Promise<CustomerComment[]> {
  return apiFetch<CustomerComment[]>(`/pwa/admin/customers/${customerId}/comments`)
}

export async function addCustomerComment(customerId: string, text: string): Promise<void> {
  await apiFetch(`/pwa/admin/customers/${customerId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export async function updateCustomerComment(
  customerId: string, commentId: string, text: string,
): Promise<void> {
  await apiFetch(`/pwa/admin/customers/${customerId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  })
}

export async function deleteCustomerComment(customerId: string, commentId: string): Promise<void> {
  await apiFetch(`/pwa/admin/customers/${customerId}/comments/${commentId}`, { method: 'DELETE' })
}
