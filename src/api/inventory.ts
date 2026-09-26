// Zählen — der Teil der Inventur, den beide Oberflächen brauchen.
//
// Die Endpoints liegen unter `/pwa/admin/inventory/…`, die Aufrufer aber nicht
// beide im Admin: Ein Inventurmanager mit Rolle `user` zählt in der Monteur-PWA
// (docs/specs/rollierende-inventur.md E8, §10.5). Darum stehen genau die vier
// Aufrufe, die der Zählmodus braucht, hier in `api/` statt in `api/admin/` —
// `api/admin/inventory.ts` re-exportiert sie, damit bestehende Importe gültig
// bleiben.
//
// Der Pfad bleibt `/pwa/admin/…`: Wer zählen darf, entscheidet serverseitig
// `require_counter` (Admin-Rolle ODER die Zuteilung einer offenen Zählung) —
// nicht das Präfix der Adresse. Ein zweiter Satz Routen unter `/pwa/inventory/`
// wäre dieselbe Prüfung an zwei Stellen, und die zweite läuft irgendwann
// auseinander.

import { apiFetch } from './client'

/** `rollierend` entsteht nur über einen Zählplan — von Hand anzulegen hiesse,
 *  eine Tranche ohne Plan, ohne Fälligkeit und ohne Zähler anzulegen. */
export type CountKind = 'voll' | 'stich' | 'rollierend'
export type CountStatus = 'offen' | 'abgeschlossen' | 'abgebrochen'

export interface StockCount {
  id: string
  kind: CountKind
  status: CountStatus
  title: string
  /** `carried_material_ids`: Artikel, die aus der vorigen Tranche übernommen
   *  wurden (Spec E4). Der Zählmodus kennzeichnet sie — sie standen schon
   *  einmal auf einer Liste, und das gehört zur Zählung dazu. */
  scope: { category?: string; carried_material_ids?: string[] }
  started_at: string
  started_by: string
  closed_at: string | null
  closed_by: string | null
  note: string | null
  /** Inventurdifferenz in CHF zum Einkaufspreis; erst nach dem Abschluss gesetzt. */
  diff_value_ek: number | null
  /** Zählplan, aus dem diese Tranche entstand; `null` bei Voll-/Stichzählungen. */
  plan_id?: string | null
  /** Bis wann gezählt sein soll. Danach ist die Tranche überfällig — abgebrochen
   *  wird sie nie automatisch, das entscheidet ein Mensch vor der nächsten. */
  due_on?: string | null
  assigned_to?: string | null
  assigned_name?: string | null
  /** Nur bei offenen Zählungen gesetzt (die Liste liefert ihn gleich mit, damit
   *  die Maske nicht je Zeile ins Detail greifen muss). */
  progress?: { gezaehlt: number; gesamt: number } | null
}

export interface StockCountItem {
  id: string
  count_id: string
  material_id: string
  art_nr: string
  name: string
  unit: string | null
  kategorie: string | null
  /** Bestand beim Anlegen der Zählung — nur Anzeige («Soll anzeigen»). */
  expected_at_start: number
  counted_qty: number | null
  counted_at: string | null
  counted_by: string | null
  /** Soll zum ZÄHLZEITPUNKT, beim Abschluss zurückgerechnet. Verglichen wird
   *  hiermit, nicht mit `expected_at_start`: Die Zählung friert nichts ein. */
  expected_at_count: number | null
  diff: number | null
  cost_price_snapshot: number | null
  cost_price: number | null
  note: string | null
  /** Signierte Adresse des Artikelbilds — nur mit `{ images: true }` gesetzt.
   *  Im Lager erkennt man die Kiste am Bild schneller als an der Art.-Nr. */
  image_url?: string | null
}

export interface StockCountDetail {
  count: StockCount
  items: StockCountItem[]
  progress: { gezaehlt: number; gesamt: number }
}

export interface CountSummary {
  positionen: number
  gezaehlt: number
  offen: number
  mit_differenz: number
  diff_value_ek: number
  /** Positionen mit Differenz, aber ohne Einkaufspreis — sie fehlen in der
   *  CHF-Summe. Ohne diese Zahl läse sich die Summe als vollständig. */
  ohne_ek: number
}

/**
 * Kopf und Positionen einer Zählung.
 *
 * `images` kostet serverseitig einen Signier-Request und macht die Antwort
 * spürbar grösser — der Zählmodus fragt danach, die Tabelle nicht.
 */
export async function getStockCount(
  id: string, opts: { images?: boolean } = {},
): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>(
    `/pwa/admin/inventory/counts/${encodeURIComponent(id)}${opts.images ? '?images=1' : ''}`,
  )
}

/** `countedQty: null` macht die Position wieder ungezählt (Weg zurück nach einem Vertipper). */
export async function recordCountItem(
  countId: string, itemId: string, countedQty: number | null, note?: string | null,
): Promise<{ status: string; item: StockCountItem }> {
  return apiFetch(
    `/pwa/admin/inventory/counts/${encodeURIComponent(countId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: JSON.stringify({ counted_qty: countedQty, note: note ?? null }) },
  )
}

export async function closeStockCount(id: string): Promise<{ status: string; summary: CountSummary }> {
  return apiFetch(`/pwa/admin/inventory/counts/${encodeURIComponent(id)}/close`, { method: 'POST' })
}

export async function abortStockCount(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/inventory/counts/${encodeURIComponent(id)}/abort`, { method: 'POST' })
}

/** Die offenen Zählungen, die MIR zugeteilt sind. Der Filter sitzt im Server:
 *  Ein Konto ohne Admin-Rolle bekommt von hier nie eine fremde Zählung. */
export async function listMyStockCounts(): Promise<{ rows: StockCount[] }> {
  return apiFetch<{ rows: StockCount[] }>('/pwa/admin/inventory/counts?status=offen')
}
