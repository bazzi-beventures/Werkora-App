import { useState } from 'react'
import { WerkoraMark } from '../brand/WerkoraMark'
import {
  istWeggeklickt,
  migrationStufe,
  migrationText,
  tageBisStichtag,
  type MigrationStufe,
} from './migrationNotice'

/** Höhe des Streifens. App.tsx schiebt die anderen Banner darum nach unten. */
export const MIGRATION_STREIFEN_HOEHE = 46

const KEY_WEGGEKLICKT = 'migrationHinweisWeggeklickt'
const KEY_UEBERSPRUNGEN = 'migrationVorschaltUebersprungen'

export function aktuelleMigrationStufe(now: Date = new Date()): MigrationStufe {
  return migrationStufe(
    now,
    import.meta.env.VITE_MIGRATION_NOTICE,
    import.meta.env.VITE_MIGRATION_DEADLINE,
  )
}

function lies(key: string, store: Storage): string | null {
  try { return store.getItem(key) } catch { return null }
}
function schreib(key: string, wert: string, store: Storage): void {
  try { store.setItem(key, wert) } catch { /* privates Fenster */ }
}

/**
 * Der Umzugsstreifen bzw. die Vorschaltseite auf der ALTEN Origin.
 *
 * Erscheint nur, wenn `VITE_MIGRATION_NOTICE` im Build gesetzt ist — also
 * ausschliesslich im Build für die alte Domain. Im normalen Build ist die
 * Variable leer und diese Komponente rendert `null`.
 *
 * Bewusst sichtbar **auch im eingeloggten Zustand**: Der Session-Cookie hält
 * 30 Tage, im Parallelbetrieb sieht also niemand von selbst je einen
 * Login-Screen. Ein Hinweis, der nur vor dem Login steht, erreicht genau die
 * Leute nicht, um die es geht.
 */
export function MigrationBanner({ now = new Date() }: { now?: Date }) {
  const stufe = aktuelleMigrationStufe(now)
  const url = import.meta.env.VITE_MIGRATION_NOTICE as string | undefined
  const stichtag = import.meta.env.VITE_MIGRATION_DEADLINE as string | undefined

  const [weggeklickt, setWeggeklickt] = useState(() =>
    lies(KEY_WEGGEKLICKT, localStorage))
  // Das Überspringen der Vorschaltseite gilt nur für diese Sitzung — beim
  // nächsten App-Start steht sie wieder da. «Überspringbar» heisst nicht
  // «einmal wegklicken und nie wieder».
  const [uebersprungen, setUebersprungen] = useState(() =>
    lies(KEY_UEBERSPRUNGEN, sessionStorage) === '1')

  if (stufe === 'aus' || !url) return null

  const rest = stichtag ? tageBisStichtag(now, stichtag) : Number.NaN

  if (stufe === 'vorschalt' && !uebersprungen) {
    return (
      <div className="migration-vorschalt">
        <div className="migration-vorschalt-inner">
          <div className="migration-vorschalt-mark"><WerkoraMark title="Werkora" /></div>
          <h1 className="migration-vorschalt-titel">Werkora ist umgezogen</h1>
          <p className="migration-vorschalt-text">
            {migrationText(stufe, rest).replace(' Jetzt wechseln →', '')}
            {' '}Melde dich einmal unter der neuen Adresse an und lege das Symbol
            neu auf den Startbildschirm.
          </p>
          <a className="migration-vorschalt-btn" href={url}>Zur neuen Adresse</a>
          <button
            type="button"
            className="migration-vorschalt-skip"
            onClick={() => { schreib(KEY_UEBERSPRUNGEN, '1', sessionStorage); setUebersprungen(true) }}
          >
            Später — jetzt weiterarbeiten
          </button>
        </div>
      </div>
    )
  }

  // Ab 'dringend' ist der Streifen nicht mehr wegklickbar.
  const wegklickbar = stufe === 'hinweis'
  if (wegklickbar && istWeggeklickt(stufe, weggeklickt)) return null

  return (
    <div className={`migration-streifen migration-streifen-${stufe}`} role="status">
      <a className="migration-streifen-link" href={url}>{migrationText(stufe, rest)}</a>
      {wegklickbar && (
        <button
          type="button"
          className="migration-streifen-zu"
          aria-label="Hinweis ausblenden"
          onClick={() => { schreib(KEY_WEGGEKLICKT, stufe, localStorage); setWeggeklickt(stufe) }}
        >
          ×
        </button>
      )}
    </div>
  )
}
