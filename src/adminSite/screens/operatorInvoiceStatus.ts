import type { Invoice } from '../../api/admin/invoices'
import { todayISO } from '../../admin/utils/format'
import { isInvoiceOpen } from '../../admin/utils/openInvoices'

/**
 * Was in der Rechnungsliste des Betreibers in der Status-Spalte steht — und
 * welcher Reiter eine Zeile fängt.
 *
 * Spec: docs/specs/admin-werkora-ch.md §8.3/§10.11.
 *
 * Eigenes Modul, nicht im Screen: Es sind reine Funktionen über einer
 * `Invoice`, sie sind der testbare Teil der Ansicht, und ein Komponenten-Modul,
 * das daneben Funktionen exportiert, kostet Fast Refresh.
 */

/** Die Filter-Reiter. `alle` ist kein Status, sondern deren Abwesenheit. */
export type Reiter = 'alle' | 'offen' | 'verspaetet' | 'bezahlt' | 'archiviert'

export const REITER: { id: Reiter; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'offen', label: 'Offen' },
  { id: 'verspaetet', label: 'Verspätet' },
  { id: 'bezahlt', label: 'Bezahlt' },
  { id: 'archiviert', label: 'Archiviert' },
]

/**
 * Ist die Frist überschritten?
 *
 * `due_date` entsteht beim Versand (`db/invoices.set_invoice_sent_at`) und ist
 * dieselbe Grösse, an der Zahlungserinnerung und Mahnung hängen. Die Farbe im
 * Bildschirm sagt damit dasselbe wie das Verhalten des Systems — ein eigener
 * Rechenweg hier wäre die klassische Art, sich davon zu entfernen.
 *
 * Ohne `due_date` ist nichts verspätet: die Rechnung ist noch nicht raus.
 */
export function istVerspaetet(inv: Invoice, heute = todayISO()): boolean {
  if (!inv.due_date || !isInvoiceOpen(inv.status)) return false
  return inv.due_date < heute
}

/** Status-Etikett und Badge-Klasse — «Verspätet» schlägt den rohen Status. */
export function anzeigeStatus(inv: Invoice, heute = todayISO()): { label: string; badge: string } {
  if (istVerspaetet(inv, heute)) return { label: 'Verspätet', badge: 'admin-badge-rejected' }
  if (inv.status === 'bezahlt') return { label: 'Bezahlt', badge: 'admin-badge-paid' }
  if (inv.status === 'archiviert') return { label: 'Archiviert', badge: 'admin-badge-closed' }
  if (inv.status === 'inaktiv') return { label: 'Inaktiv', badge: 'admin-badge-closed' }
  if (inv.status === 'gesendet') return { label: 'Gesendet', badge: 'admin-badge-sent' }
  return { label: 'Offen', badge: 'admin-badge-open' }
}

export function passtZuReiter(inv: Invoice, reiter: Reiter, heute = todayISO()): boolean {
  switch (reiter) {
    case 'alle': return inv.status !== 'archiviert'
    case 'offen': return isInvoiceOpen(inv.status) && !istVerspaetet(inv, heute)
    case 'verspaetet': return istVerspaetet(inv, heute)
    case 'bezahlt': return inv.status === 'bezahlt'
    case 'archiviert': return inv.status === 'archiviert'
  }
}
