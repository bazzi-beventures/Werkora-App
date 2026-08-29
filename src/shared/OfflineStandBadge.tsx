import { snapshotAge } from '../api/offlineStore'

/**
 * «Offline — Stand 07:42» über einem Screen, der gerade aus dem Lesepaket
 * rendert (docs/specs/offline-modus.md §3.4).
 *
 * Bewusst NICHT das globale Offline-Banner aus App.tsx: das sagt «kein Netz»,
 * dieser Badge sagt, wie alt genau die Daten sind, auf die der Monteur schaut.
 * Ab 24 h steht das Datum dabei und die Farbe warnt — verfallen tut der Snapshot
 * trotzdem nicht: auf der Baustelle sind alte Daten besser als keine.
 */
export function OfflineStandBadge({ savedAt, now }: { savedAt: string; now?: Date }) {
  const { label, stale } = snapshotAge(savedAt, now)
  return (
    <div className={`offline-stand-badge${stale ? ' stale' : ''}`} role="status">
      {label}
    </div>
  )
}
