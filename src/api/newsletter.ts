/**
 * Newsletter — Redaktionsplan ansehen, Vorschau, Versand auslösen.
 *
 * Spec: docs/specs/newsletter.md, docs/specs/admin-werkora-ch.md §4.3/2.
 *
 * Die vier Endpunkte gibt es seit August; was fehlte, war eine Oberfläche —
 * versendet wurde bisher per `curl`. **Kein Schreiben**: der Inhalt einer
 * Ausgabe lebt im Code (`services/newsletter_content.py`), und ein Editor wäre
 * ein zweiter Ort für denselben Text.
 */
import { apiFetch, apiTextFetch } from './client'

export interface NewsletterItem {
  title: string
  text: string
  push: string
  roles: string[]
  modules_any: string[]
}

export interface NewsletterEdition {
  key: string
  created_on: string
  subject: string
  intro: string
  outro: string
  items: NewsletterItem[]
}

/** Was ein Versand je Mandant bewirkt hat. Form aus `SendSummary.as_dict()`. */
export interface NewsletterSendResult {
  [k: string]: unknown
}

export async function listEditions(): Promise<NewsletterEdition[]> {
  const res = await apiFetch<{ editions: NewsletterEdition[] }>('/pwa/superadmin/newsletter/editions')
  return res.editions ?? []
}

/**
 * Das gerenderte Mail-HTML der Vorschau.
 *
 * Geholt und dann als `<iframe srcdoc>` gezeigt — **nicht** als `<iframe src>`
 * auf diese Route. Das war die erste Fassung, und sie zeigte auf
 * admin-staging.werkora.ch nie etwas anderes als eine graue Fläche mit
 * Abbruch-Symbol: das Backend setzt `X-Frame-Options: DENY` auf jeder Antwort
 * (agents/middleware.py), und damit weigert sich der Browser, das Dokument im
 * Rahmen anzuzeigen. Dazu kommt die CSP der Admin-Seite, die mit
 * `default-src 'self'` auch fremde Rahmen-Quellen abdeckt.
 *
 * Isoliert bleibt die Vorschau trotzdem: `srcdoc` zusammen mit `sandbox=""`
 * ergibt ein eigenes Dokument ohne Skripte und ohne Zugriff auf unseres — das
 * war der Grund für den Rahmen (Mail-HTML bringt eigene Stile mit).
 */
export function previewHtml(
  editionKey: string, tenantId: string, role: string,
): Promise<string> {
  const q = new URLSearchParams({ edition_key: editionKey, tenant_id: tenantId, role })
  return apiTextFetch(`/pwa/superadmin/newsletter/preview?${q}`)
}

export function previewPush(
  editionKey: string, tenantId: string, role: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ edition_key: editionKey, tenant_id: tenantId, role })
  return apiFetch(`/pwa/superadmin/newsletter/preview-push?${q}`)
}

/**
 * Versendet eine Ausgabe. `targetTenantId = null` heisst **alle** Mandanten.
 *
 * Das Feld heisst serverseitig `target_tenant_id`, nicht `tenant_id`: es
 * benennt das ZIEL, nicht den Mandanten des Aufrufers. Der Ratchet
 * `test_no_server_fields_in_body.py` sperrt `tenant_id` im Body generell.
 */
export function sendEdition(
  editionKey: string, targetTenantId: string | null,
): Promise<{ edition_key: string; results: NewsletterSendResult[] }> {
  return apiFetch('/pwa/superadmin/newsletter/send', {
    method: 'POST',
    body: JSON.stringify({ edition_key: editionKey, target_tenant_id: targetTenantId }),
  })
}
