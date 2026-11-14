import type { EinsatzStand } from '../../api/serviceBegleitung'
import './einsatzStand.css'

// Punkt am Termin in der Plantafel — Servicebegleitung, Unterwegs-Meldung
// (docs/specs/servicebegleitung.md §5.5): grau geplant, blau unterwegs (mit
// «ca. 08:30»), grün vor Ort, Haken erledigt. Gezeigt wird, was der Monteur
// selbst gemeldet hat, nie ein Ort; ohne Namen, ohne Auswertung je Person.

const TEXT: Record<EinsatzStand['stand'], string> = {
  geplant: 'Geplant',
  unterwegs: 'Unterwegs',
  vor_ort: 'Vor Ort',
  erledigt: 'Erledigt',
}

function einsatzStandText(stand: EinsatzStand): string {
  if (stand.stand === 'unterwegs' && stand.ankunft_ca) return `Unterwegs, Ankunft ca. ${stand.ankunft_ca}`
  if (stand.stand === 'vor_ort' && stand.vor_ort_at) return `Vor Ort seit ${stand.vor_ort_at}`
  return TEXT[stand.stand]
}

export function EinsatzStandPunkt({ stand }: { stand: EinsatzStand | undefined }) {
  if (!stand) return null
  const text = einsatzStandText(stand)
  return (
    <span className={`einsatz-stand einsatz-stand--${stand.stand}`} title={text} aria-label={text}>
      {stand.stand === 'erledigt' ? '✓' : ''}
      {stand.stand === 'unterwegs' && stand.ankunft_ca && <span className="einsatz-stand-zeit">ca. {stand.ankunft_ca}</span>}
    </span>
  )
}
