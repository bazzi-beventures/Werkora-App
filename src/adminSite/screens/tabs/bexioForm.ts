/**
 * Reine Hilfen des Reiters «bexio» — ohne React, unit-getestet.
 *
 * Spec: docs/specs/bexio-anbindung.md §6.8 (Kontierung), §8.1 (Reiter).
 */
import type { BexioCatalog, BexioConnection, BexioDefaults, BexioJob } from '../../tenantScopedApi'

/** Abschlusskonten des Treuhänders — Werkora bebucht sie nie (Server prüft dasselbe). */
export const GESPERRTE_KONTEN = new Set(['3901', '3902'])

/** Ertragskonten, die die Auswahl anbietet: aktiv, Klasse 3, ohne Abschlusskonten. */
export function revenueAccounts(catalog: BexioCatalog | null) {
  return (catalog?.accounts ?? [])
    .filter(a => a.is_active !== false && a.account_no.startsWith('3') && !GESPERRTE_KONTEN.has(a.account_no))
    .sort((a, b) => a.account_no.localeCompare(b.account_no))
}

export function defaultsFrom(conn: BexioConnection): BexioDefaults {
  return {
    default_account_id: conn.default_account_id,
    account_by_work_type: { ...(conn.account_by_work_type ?? {}) },
    default_tax_id: conn.default_tax_id,
    default_tax_id_zero: conn.default_tax_id_zero,
    default_unit_id_hours: conn.default_unit_id_hours,
    default_unit_id_piece: conn.default_unit_id_piece,
    default_unit_id_flat: conn.default_unit_id_flat,
    default_bank_account_id: conn.default_bank_account_id,
    payments_push: conn.payments_push,
    payments_pull: conn.payments_pull,
  }
}

/** Zahlungsrichtung als eine Wahl — melden und holen schliessen sich aus (Spec §6.5/§6.6). */
export type PaymentDirection = 'push' | 'pull' | 'none'

export function paymentDirection(d: Pick<BexioDefaults, 'payments_push' | 'payments_pull'>): PaymentDirection {
  if (d.payments_pull) return 'pull'
  return d.payments_push ? 'push' : 'none'
}

export function withPaymentDirection<T extends BexioDefaults>(d: T, dir: PaymentDirection): T {
  return { ...d, payments_push: dir === 'push', payments_pull: dir === 'pull' }
}

/** Eine Leistungsart auf ein Konto setzen — `null` heisst «Standardkonto» und
 *  entfernt den Eintrag, statt `null` zu speichern. */
export function setWorkTypeAccount(
  map: Record<string, number>, workType: string, accountId: number | null,
): Record<string, number> {
  const next = { ...map }
  if (accountId == null) delete next[workType]
  else next[workType] = accountId
  return next
}

const KIND_LABELS: Record<BexioJob['kind'], string> = {
  customer_upsert: 'Kontakt',
  invoice_issue: 'Rechnung',
  payment_sync: 'Zahlung',
  invoice_cancelled: 'Storno-Hinweis',
}

export function jobLabel(job: BexioJob): string {
  return KIND_LABELS[job.kind] ?? job.kind
}

const STATUS: Record<BexioJob['status'], { label: string; badge: string }> = {
  pending: { label: 'wartet', badge: 'admin-badge-pending' },
  running: { label: 'läuft', badge: 'admin-badge-open' },
  done: { label: 'erledigt', badge: 'admin-badge-approved' },
  error: { label: 'wird wiederholt', badge: 'admin-badge-draft' },
  needs_attention: { label: 'braucht dich', badge: 'admin-badge-rejected' },
}

export function jobStatus(job: BexioJob) {
  return STATUS[job.status] ?? { label: job.status, badge: 'admin-badge-draft' }
}

/** Welche Aktionen ein Auftrag anbietet. */
export function jobActions(job: BexioJob): { retry: boolean; linkContact: boolean; cancelInBexio: boolean } {
  const failed = job.status === 'needs_attention' || job.status === 'error'
  return {
    retry: failed && job.kind !== 'invoice_cancelled',
    linkContact: job.status === 'needs_attention'
      && (job.kind === 'invoice_issue' || job.kind === 'customer_upsert')
      && /in bexio/.test(job.last_error ?? '') && /×/.test(job.last_error ?? ''),
    cancelInBexio: job.status === 'needs_attention' && job.kind === 'invoice_cancelled',
  }
}

/** «läuft am 01.01.2027 ab (in 61 Tagen)» — null ohne Datum. */
export function expiryText(iso: string | null, now: Date = new Date()): { text: string; warn: boolean } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const days = Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
  const date = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (days < 0) return { text: `abgelaufen am ${date}`, warn: true }
  return { text: `läuft am ${date} ab (in ${days} Tag${days === 1 ? '' : 'en'})`, warn: days <= 14 }
}
