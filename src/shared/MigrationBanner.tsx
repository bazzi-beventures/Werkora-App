import { useEffect, useState } from 'react'
import { WerkoraMark } from '../brand/WerkoraMark'
import { toDateStr } from '../admin/utils/calendarHelpers'
import {
  istWeggeklickt,
  migrationStufe,
  migrationText,
  tageBisStichtag,
  wegklickWert,
  zielHost,
  type MigrationStufe,
} from './migrationNotice'

/** Höhe des Streifens. App.tsx schiebt die anderen Banner darum nach unten.
 *  Zweizeilig, seit die Adresse lesbar dastehen muss und nicht nur als
 *  Klickziel dient. */
export const MIGRATION_STREIFEN_HOEHE = 58

// Wert: `stufe|JJJJ-MM-TT` — das Wegklicken gilt nur für diesen Tag und diese
// Stufe (siehe istWeggeklickt). Die erste Fassung speicherte nur die Stufe;
// solche Altwerte gelten als nicht weggeklickt, deshalb kein
// APP_DATA_VERSION-Schritt.
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
  const aus = stufe === 'aus' || !url

  // Neu bewerten, sobald die App wieder im Vordergrund ist.
  //
  // Ohne diesen Haken klebte der Streifen am Zeitpunkt des Seitenaufbaus: eine
  // installierte PWA auf dem Werkstatt-Tablet und ein offener Bürotab laufen
  // tagelang ohne Neuladen. Der gestern weggeklickte Hinweis bliebe dort heute
  // weg — also genau bei den Leuten, die die App nie schliessen und deshalb im
  // Parallelbetrieb auch nie einen Login-Screen sehen. Dieselbe Neubewertung
  // lässt auch die Eskalation über Nacht greifen.
  //
  // Im normalen Build (Flag leer) wird gar nichts registriert.
  const [, neuBewerten] = useState(0)
  useEffect(() => {
    if (aus) return
    const wecken = () => { if (!document.hidden) neuBewerten(n => n + 1) }
    document.addEventListener('visibilitychange', wecken)
    window.addEventListener('focus', wecken)
    return () => {
      document.removeEventListener('visibilitychange', wecken)
      window.removeEventListener('focus', wecken)
    }
  }, [aus])

  const [weggeklickt, setWeggeklickt] = useState(() =>
    lies(KEY_WEGGEKLICKT, localStorage))
  // Das Überspringen der Vorschaltseite gilt nur für diese Sitzung — beim
  // nächsten App-Start steht sie wieder da. «Überspringbar» heisst nicht
  // «einmal wegklicken und nie wieder».
  const [uebersprungen, setUebersprungen] = useState(() =>
    lies(KEY_UEBERSPRUNGEN, sessionStorage) === '1')

  if (aus || !url) return null

  const heute = toDateStr(now)
  const rest = stichtag ? tageBisStichtag(now, stichtag) : Number.NaN

  const text = migrationText(stufe, rest, url)

  if (stufe === 'vorschalt' && !uebersprungen) {
    return (
      <div className="migration-vorschalt">
        <div className="migration-vorschalt-inner">
          <div className="migration-vorschalt-mark"><WerkoraMark title="Werkora" /></div>
          <h1 className="migration-vorschalt-titel">Werkora ist umgezogen</h1>
          <p className="migration-vorschalt-text">
            {text.zeile1}. Die neue Adresse lautet{' '}
            <strong className="migration-vorschalt-host">{zielHost(url)}</strong>.
          </p>
          <ul className="migration-vorschalt-liste">
            <li>Dort <strong>einmal neu anmelden</strong> — die alte Anmeldung gilt nicht mit.</li>
            <li>Das Symbol <strong>neu auf den Startbildschirm</strong> legen.</li>
            <li>Benachrichtigungen <strong>erneut erlauben</strong>.</li>
          </ul>
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
  if (wegklickbar && istWeggeklickt(stufe, weggeklickt, heute)) return null

  return (
    <div className={`migration-streifen migration-streifen-${stufe}`} role="status">
      <a className="migration-streifen-link" href={url}>
        <span className="migration-streifen-z1">{text.zeile1}</span>
        <span className="migration-streifen-z2">{text.zeile2}</span>
      </a>
      {wegklickbar && (
        <button
          type="button"
          className="migration-streifen-zu"
          aria-label="Hinweis für heute ausblenden"
          onClick={() => {
            const wert = wegklickWert(stufe, heute)
            schreib(KEY_WEGGEKLICKT, wert, localStorage)
            setWeggeklickt(wert)
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
