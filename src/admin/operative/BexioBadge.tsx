import type { BexioBadge as Badge } from '../../api/admin/invoices'

// Badge «in bexio / wird übertragen / Fehler / Storno offen» an einer Rechnung
// (docs/specs/bexio-anbindung.md §8.2, §6.7). Einrichten und Fehler beheben tut
// der Betreiber; **das Storno entscheidet der Betrieb** — eine Buchung mit
// MWST-Wirkung gehört nicht in die Hand des Betreibers. Deshalb ist «Storno
// offen» als einzige Pille anklickbar.

// Ausgeschrieben statt «bexio …»: in der Rechnungsliste las sich die knappe Form
// wie abgeschnittener Text (Test mit dem Testkonto, 2026-11-01).
const LOOK: Record<Badge['state'], { label: string; cls: string; title: string }> = {
  in_bexio: { label: 'in bexio', cls: 'admin-badge-approved', title: 'In der bexio-Buchhaltung ausgestellt' },
  wird_uebertragen: { label: 'bexio: wird übertragen', cls: 'admin-badge-pending', title: 'Wird in den nächsten Minuten nach bexio übertragen' },
  fehler: { label: 'bexio: Fehler', cls: 'admin-badge-rejected', title: '' },
  storniert: { label: 'bexio: storniert', cls: 'admin-badge-closed', title: 'In bexio storniert' },
  storno_offen: {
    label: 'bexio: Storno offen', cls: 'admin-badge-pending',
    title: 'In Werkora archiviert, in bexio noch gebucht — klicken, um in bexio zu stornieren',
  },
}

export function BexioBadge({ badge, onCancelRequest }: {
  badge?: Badge
  /** Nur bei «Storno offen»: öffnet die Rückfrage. Ohne Handler bleibt die Pille Anzeige. */
  onCancelRequest?: () => void
}) {
  if (!badge) return null
  const look = LOOK[badge.state]
  if (!look) return null
  if (badge.state === 'storno_offen' && badge.confirmed) {
    return (
      <span className="admin-badge admin-badge-pending" style={{ marginLeft: 6 }}
        title="Storno bestätigt — wird in den nächsten Minuten in bexio ausgeführt">
        bexio: wird storniert
      </span>
    )
  }
  const title = badge.state === 'fehler'
    ? `Übertragung nach bexio hängt: ${badge.message || 'unbekannter Grund'}. Der Werkora-Support ist informiert.`
    : look.title
  if (badge.state === 'storno_offen' && onCancelRequest) {
    return (
      <button type="button" className={`admin-badge ${look.cls}`}
        style={{ marginLeft: 6, cursor: 'pointer', border: 'none', font: 'inherit' }}
        title={title} onClick={onCancelRequest}>
        {look.label}
      </button>
    )
  }
  return (
    <span className={`admin-badge ${look.cls}`} style={{ marginLeft: 6 }} title={title}>
      {look.label}
    </span>
  )
}

/** Häkchen im Archivieren-Dialog — nur sichtbar, wenn die Rechnung in bexio gebucht ist. */
export function BexioCancelCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, textAlign: 'left' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        <strong>Auch in bexio stornieren</strong><br />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Die Rechnung ist in bexio gebucht. Ein Storno ist eine Buchung mit Wirkung auf die MWST —
          nur, wenn die Rechnung wirklich nicht gilt. Ohne Häkchen bleibt sie in bexio stehen und
          trägt «bexio: Storno offen», bis jemand entscheidet.
        </span>
      </span>
    </label>
  )
}

/** Text der Rückfrage zur Pille «Storno offen». */
export const BEXIO_CANCEL_MESSAGE =
  'Die Rechnung ist in Werkora archiviert, in bexio aber noch gebucht. Ein Storno ist eine Buchung ' +
  'mit Wirkung auf die MWST — nur bestätigen, wenn die Rechnung wirklich nicht gilt. Ausgeführt wird ' +
  'es in den nächsten Minuten.'
