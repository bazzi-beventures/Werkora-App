import { useEffect, useState } from 'react'
import { getZeitStatus, ZeitStatus } from '../api/chat'
import { hasModule, isFeatureEnabled } from '../api/modules'
import type { UserInfo } from '../api/auth'

/**
 * Stempel-Pflicht für den Rapport (Feature `rapport_nur_eingestempelt`).
 *
 * Sichtbare Hälfte der Regel: der Knopf «Rapport erstellen» ist ausgegraut und der
 * Chat nimmt keine Eingabe an, solange der Monteur ausgestempelt ist. Massgeblich
 * ist der Server — `services/report_policy.py::report_clock_in_blocked` weist den
 * Rapport-Chat ab, auch wenn ein alter Client den Knopf noch freigibt. Beide
 * Fassungen müssen dieselben Ausnahmen kennen, sonst zeigt die App einen aktiven
 * Knopf, hinter dem eine Absage wartet (oder umgekehrt).
 */

export const RAPPORT_CLOCK_IN_HINT =
  'Du bist nicht eingestempelt — ein Rapport lässt sich nur während der Arbeitszeit '
  + 'erfassen. Stempel dich ein, dann geht es weiter.'

/** Kurzform für `title`/Tooltip am gesperrten Knopf. */
export const RAPPORT_CLOCK_IN_TITLE = 'Nicht eingestempelt'

/**
 * Gilt die Regel für diesen Benutzer überhaupt?
 *
 * Drei Freibriefe, jeder einzeln ausreichend — dieselben wie serverseitig:
 * kein Feature, kein Modul `timekeeping` (dann gibt es gar keinen Stempel), oder
 * Rolle `superadmin` (Plattform-Owner ist in keinem Mandanten eingestempelt).
 */
export function rapportClockInApplies(user: UserInfo | null): boolean {
  if (!user || user.role === 'superadmin') return false
  return hasModule(user, 'timekeeping') && isFeatureEnabled(user, 'rapport_nur_eingestempelt')
}

/**
 * Ist der Rapport gerade gesperrt?
 *
 * `status === null` heisst «noch nicht geladen / nicht abrufbar» und sperrt
 * bewusst NICHT: offline auf der Baustelle ist der Normalfall, und der Server
 * lehnt notfalls selbst ab. `on_break` zählt als eingestempelt — die Session
 * läuft, nur die Pause unterbricht sie.
 */
export function rapportClockInBlocked(
  user: UserInfo | null,
  status: ZeitStatus | null,
): boolean {
  if (!rapportClockInApplies(user)) return false
  if (!status) return false
  return status.status === 'inactive'
}

/**
 * Lädt den Stempel-Status und sagt, ob der Rapport gesperrt ist.
 *
 * Pollt wie die Statuskarte auf dem Startbildschirm alle 30 s — der Monteur
 * stempelt in einer anderen Ansicht ein und erwartet den Knopf danach frei,
 * ohne die App neu zu laden. Ohne geltende Regel wird gar nicht erst geladen.
 */
export function useRapportClockInBlocked(user: UserInfo | null): boolean {
  const applies = rapportClockInApplies(user)
  const [status, setStatus] = useState<ZeitStatus | null>(null)

  useEffect(() => {
    if (!applies) { setStatus(null); return }
    let cancelled = false
    async function load() {
      if (!navigator.onLine) return
      try {
        const data = await getZeitStatus()
        if (!cancelled) setStatus(data)
      } catch {
        // Unbekannter Stand sperrt nicht (siehe rapportClockInBlocked).
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [applies])

  return rapportClockInBlocked(user, status)
}
