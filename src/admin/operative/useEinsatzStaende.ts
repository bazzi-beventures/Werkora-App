import { useEffect, useState } from 'react'
import { type EinsatzStand, fetchEinsatzStaende } from '../../api/serviceBegleitung'
import { todayISO } from '../../api/schedule'

/** Stand der Kundeneinsätze von heute fürs Büro, je Termin-id. */
export interface EinsatzStaende {
  date: string
  meldungen: Record<string, EinsatzStand>
}

// Einmal je Minute: die Meldung des Monteurs soll in der Plantafel stehen, bevor
// das Büro den Kunden anruft — sekundengenau muss sie nicht sein. Nur solange das
// Werkzeug für dieses Konto an ist; sonst kein Abruf.
const TAKT_MS = 60_000

export function useEinsatzStaende(aktiv: boolean): EinsatzStaende | null {
  const [staende, setStaende] = useState<EinsatzStaende | null>(null)
  useEffect(() => {
    if (!aktiv) return
    let alive = true
    const laden = () => {
      fetchEinsatzStaende(todayISO())
        .then(r => { if (alive) setStaende(r) })
        // Ein Fehler kostet nur die Punkte — die Plantafel plant weiter.
        .catch(() => {})
    }
    laden()
    const timer = window.setInterval(laden, TAKT_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [aktiv])
  return aktiv ? staende : null
}
