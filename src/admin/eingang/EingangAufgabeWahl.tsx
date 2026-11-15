import { useState } from 'react'
import type { EingangAufgabe, EingangItem } from '../../api/admin/mailEingang'
import { aufgabeLabel, kategorieLabel } from './mailEingang'

/**
 * Die Aufgabe an der Karte — docs/specs/mail-eingang-zustaendigkeiten.md §4.3, §7.2.
 *
 * Die Einordnung irrt sich; wer die Karte öffnet, stellt die Aufgabe um.
 * **Korrigiert wird die Aufgabe, nie eine Person** — so bleibt das Organigramm
 * die einzige Stelle, die sagt, wer etwas macht. Umstellen kann jeder, der die
 * Karte sieht (Zuständigkeit sperrt nicht, §1), aber nur solange sie offen ist.
 */

interface Props {
  item: Pick<EingangItem, 'id' | 'aufgabe' | 'kategorie' | 'status'>
  katalog: readonly EingangAufgabe[]
  /** Speichert die neue Aufgabe; wirft bei einem Fehler (die Auswahl springt dann zurück). */
  onAendern?: (aufgabe: string) => Promise<void>
}

export default function EingangAufgabeWahl({ item, katalog, onAendern }: Props) {
  const [laeuft, setLaeuft] = useState(false)
  const label = aufgabeLabel(item.aufgabe, katalog)

  // Ein Server ohne Katalog (älter als diese Oberfläche): wie bisher die Kategorie.
  if (katalog.length === 0) return <span className="eingang-kat">{kategorieLabel(item.kategorie)}</span>
  if (item.status !== 'offen' || !onAendern) {
    return <span className="eingang-kat">{label ?? 'Ohne Aufgabe'}</span>
  }

  async function wechsle(neu: string) {
    if (!onAendern || neu === item.aufgabe) return
    setLaeuft(true)
    try {
      await onAendern(neu)
    } catch {
      // Die Meldung kommt vom Screen; die Auswahl bleibt beim gespeicherten Wert.
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <select className="admin-input eingang-aufgabe-wahl" aria-label="Aufgabe der Mail"
            value={label ? item.aufgabe ?? '' : ''} disabled={laeuft}
            onChange={e => void wechsle(e.target.value)}>
      {!label && <option value="" disabled>Ohne Aufgabe — wählen</option>}
      {katalog.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
    </select>
  )
}
