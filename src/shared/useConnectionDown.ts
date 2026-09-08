import { useEffect, useState } from 'react'
import { CONNECTION_EVENT, connectionSeemsDown } from '../api/connectionHealth'

/**
 * «Kein Durchkommen» als React-State — die ehrlichere Fassung von
 * [useOnline](./useOnline.ts).
 *
 * `useOnline` beantwortet «hat das Gerät eine Verbindung?», dieser Hook
 * «kommt gerade etwas durch?». Der Unterschied ist die Tiefgarage: ein Balken
 * Empfang, `navigator.onLine === true`, und kein Request geht raus.
 *
 * Wofür welcher: eine Bedienung **sperren** (Deklaration, Spec §4.1) darf schon
 * am Flag hängen — im Zweifel lieber ein Knopf zu viel als einer zu wenig. Einen
 * Offline-Weg **anbieten** (§4.5) muss dagegen auch dann greifen, wenn der
 * Browser sich für online hält; sonst geht das Feature im häufigsten Fall nie
 * auf.
 */
export function useConnectionDown(): boolean {
  const [down, setDown] = useState(() => connectionSeemsDown())

  useEffect(() => {
    const nachsehen = () => setDown(connectionSeemsDown())
    window.addEventListener(CONNECTION_EVENT, nachsehen)
    window.addEventListener('online', nachsehen)
    window.addEventListener('offline', nachsehen)
    // Die Annahme «weg» verfällt nach DOWN_TTL_MS von selbst, ohne dass ein
    // Ereignis feuert. Ohne diesen Takt bliebe der Knopf bis zum nächsten
    // Request auf dem alten Stand.
    const takt = setInterval(nachsehen, 15_000)
    return () => {
      window.removeEventListener(CONNECTION_EVENT, nachsehen)
      window.removeEventListener('online', nachsehen)
      window.removeEventListener('offline', nachsehen)
      clearInterval(takt)
    }
  }, [])

  return down
}
