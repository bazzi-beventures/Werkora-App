import type { EingangAufgabe } from '../../api/admin/mailEingang'
import { ALLE_AUFGABEN } from './mailEingang'
import { VERANTWORTLICH_ALLE, VERANTWORTLICH_MEINE, VERANTWORTLICH_NIEMAND } from './eingangZustaendigkeit'

/**
 * Filter über dem Eingang — docs/specs/mail-eingang-zustaendigkeiten.md §7.1.
 *
 * Zwei Auswahlfelder, die zusammen wirken: **Aufgabe** und **Verantwortlich**.
 * Drei Grenzen (§9), die hier konstruiert sind:
 * - «Verantwortlich» gibt es nur unter «Offen» — der Screen übergibt es sonst nicht.
 * - **Keine Zahlen neben Namen**: die Auswahl ist kein Ranking. Zahlen stehen nur
 *   je Aufgabe.
 * - Nie gefiltert wird danach, wer zugeleitet oder entschieden hat
 *   (Triage-Spec §7.4).
 */

interface Props {
  katalog: readonly EingangAufgabe[]
  wert: string
  onChange: (aufgabe: string) => void
  /** Zahl je Aufgabe — nur in der Ansicht «Offen» (offene Mails). */
  zahlen?: Record<string, number>
  /** Filter nach verantwortlicher Person — nur unter «Offen» und nur mit Organigramm. */
  verantwortlich?: {
    wert: string
    personen: readonly { id: string; name: string }[]
    onChange: (wert: string) => void
  }
}

export default function EingangFilter({ katalog, wert, onChange, zahlen, verantwortlich }: Props) {
  if (katalog.length === 0) return null
  return (
    <div className="eingang-filter">
      <label className="eingang-filter-feld">
        <span className="eingang-filter-label">Aufgabe</span>
        <select className="admin-input" value={wert} onChange={e => onChange(e.target.value)}>
          <option value={ALLE_AUFGABEN}>Alle Aufgaben</option>
          {katalog.map(a => (
            <option key={a.key} value={a.key}>
              {zahlen ? `${a.label} (${zahlen[a.key] ?? 0})` : a.label}
            </option>
          ))}
        </select>
      </label>
      {verantwortlich && (
        <label className="eingang-filter-feld">
          <span className="eingang-filter-label">Verantwortlich</span>
          <select className="admin-input" value={verantwortlich.wert}
                  onChange={e => verantwortlich.onChange(e.target.value)}>
            <option value={VERANTWORTLICH_ALLE}>Alle</option>
            <option value={VERANTWORTLICH_MEINE}>Meine</option>
            {verantwortlich.personen.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={VERANTWORTLICH_NIEMAND}>Nicht zugeteilt</option>
          </select>
        </label>
      )}
    </div>
  )
}
