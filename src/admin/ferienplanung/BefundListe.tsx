// Befunde der Ferienplanung als Chips (docs/specs/ferienplanung.md §4.6, §7.1).
// Hart = rot, weich = orange. Fremde Absenzen erscheinen nur mit Name und
// «genehmigt/beantragt» — nie mit Typ (das liefert der Server gar nicht).
import type { Befund } from '../../api/admin/ferienplanung'
import './ferienplanung.css'

function datum(iso: string): string {
  const [j, m, t] = iso.split('-')
  return `${t}.${m}.${j}`
}

/** Kurzer Text: Titel, Tage, wer im Weg steht. */
export function befundText(b: Befund): string {
  const tage = b.tage.length === 0 ? '' : b.tage.length === 1 ? ` am ${datum(b.tage[0])}`
    : ` an ${b.tage.length} Tagen (${datum(b.tage[0])}–${datum(b.tage[b.tage.length - 1])})`
  const wer = b.konkurrenz.length
    ? ` — ${b.konkurrenz.map(k => `${k.name}${k.status === 'requested' ? ' (beantragt)' : ''}`).join(', ')}` : ''
  const gesetz = b.gesetz ? ` [${b.gesetz}]` : ''
  return `${b.titel}${tage}${wer}${gesetz}`
}

export function hatHartenBefund(befunde: Befund[] | undefined): boolean {
  return (befunde ?? []).some(b => b.haerte === 'hart')
}

export function BefundListe({ befunde }: { befunde?: Befund[] }) {
  if (!befunde || befunde.length === 0) return null
  return (
    <div className="ferien-befunde" data-testid="ferien-befunde">
      {befunde.map((b, i) => (
        <span key={`${b.regel_id ?? b.art}-${i}`} title={befundText(b)}
          className={`ferien-befund ferien-befund-${b.haerte === 'hart' ? 'hart' : 'weich'}`}>
          {b.haerte === 'hart' ? '⛔' : '⚠'} {befundText(b)}
        </span>
      ))}
    </div>
  )
}
