import { registerSW } from 'virtual:pwa-register'
import { canReloadNow, isClientUpdateUrgent } from './reloadGuard'

/** Mindestabstand zwischen zwei Update-Prüfungen beim Zurückkehren in die App
 *  (docs/specs/pwa-neuladen.md §3.2). Vorher prüfte JEDE Rückkehr — auch die aus
 *  Kamera oder Dateiauswahl mitten in einem Rapport. */
export const UPDATE_PRUEF_ABSTAND_MS = 15 * 60 * 1000

/** Ist wieder eine Prüfung fällig? Rein, damit die Drossel ohne Service Worker
 *  testbar ist. `zuletzt` = Zeitpunkt der letzten Prüfung, `null` = noch nie. */
export function updatePruefungFaellig(jetzt: number, zuletzt: number | null,
                                      abstandMs = UPDATE_PRUEF_ABSTAND_MS): boolean {
  return zuletzt === null || jetzt - zuletzt >= abstandMs
}

// ── Wann ein wartendes Update aktiviert wird (§3.1) ──────────────────────────
// Die Schwellen sind Vorschläge der Spec (§6: nach zwei Wochen Betrieb prüfen).

/** Kaltstart: so lange nach dem Laden gilt ein gefundenes Update noch als «beim
 *  Start» — der Nutzer sieht ohnehin «Laden…», ein Reload mehr fällt nicht auf. */
export const KALTSTART_FENSTER_MS = 15 * 1000
/** Rückkehr: nach so langer Zeit im Hintergrund ist der Faden ohnehin gerissen. */
export const RUECKKEHR_NACH_MS = 30 * 60 * 1000
/** Rückkehr, deren Update-Prüfung erst kurz danach fertig wird: bis dahin zählt
 *  sie noch als Rückkehr — sofern seither niemand etwas angetippt hat. */
export const RUECKKEHR_NACHLAUF_MS = 60 * 1000
/** Leerlauf: sichtbar, aber so lange ohne Eingabe (Admin-Tab am Bürorechner). */
export const LEERLAUF_NACH_MS = 10 * 60 * 1000

export interface UpdateLage {
  jetzt: number
  /** Zeitpunkt, zu dem die App geladen wurde. */
  gestartet: number
  /** Letzte Eingabe (Tippen, Klicken, Wischen); `null` = noch keine. */
  letzteEingabe: number | null
  /** Letzte Rückkehr in den Vordergrund und wie lange die App davor weg war. */
  rueckkehr: { at: number; wegMs: number } | null
  sichtbar: boolean
  /** Server meldet ein dringendes Update (`/pwa/me.client_update_urgent`). */
  dringend: boolean
  /** `canReloadNow()` — nichts Ungespeichertes, kein laufender Upload. */
  frei: boolean
}

/** Soll ein wartendes Update JETZT aktiviert werden? Rein und ohne Uhr — die
 *  ganze Regel aus §3.1 an einer testbaren Stelle. */
export function updateJetztAnwenden(l: UpdateLage): boolean {
  if (!l.frei) return false
  // 1. Kaltstart: noch keine Eingabe, kurz nach dem Laden.
  if (l.letzteEingabe === null && l.jetzt - l.gestartet <= KALTSTART_FENSTER_MS) return true
  // 2. Rückkehr nach langer Abwesenheit (dringend: nach jeder Abwesenheit) —
  //    solange seit der Rückkehr nichts angetippt wurde.
  if (l.rueckkehr && l.sichtbar
      && l.jetzt - l.rueckkehr.at <= RUECKKEHR_NACHLAUF_MS
      && (l.letzteEingabe === null || l.letzteEingabe < l.rueckkehr.at)
      && (l.dringend || l.rueckkehr.wegMs >= RUECKKEHR_NACH_MS)) return true
  // 3. Leerlauf: sichtbar und lange keine Eingabe.
  const ruhigSeit = l.letzteEingabe ?? l.gestartet
  return l.sichtbar && l.jetzt - ruhigSeit >= LEERLAUF_NACH_MS
}

/**
 * Registriert den Service Worker, prüft aktiv auf Updates und aktiviert ein
 * gefundenes Update erst, wenn es niemanden stört (docs/specs/pwa-neuladen.md).
 *
 * Prüfen: Eine installierte PWA prüft von sich aus nur beim ~24h-Heartbeat des
 * Browsers. Darum `registration.update()` bei der Rückkehr in die App
 * (höchstens alle 15 min), beim Online-Gehen und stündlich.
 *
 * Aktivieren: `registerType: 'prompt'` (vite.config.ts) — der neue Service
 * Worker wartet, bis `updateSW(true)` ihn übernehmen lässt und die Seite neu
 * lädt. Bis 20261024 war es `autoUpdate`: jedes gefundene Update lud sofort
 * neu, auch mitten im Rapport («Werkora lädt immer wieder»). Jetzt nur noch
 * beim Kaltstart, nach ≥ 30 min im Hintergrund oder nach 10 min Leerlauf —
 * und nie, solange `canReloadNow()` Nein sagt.
 */
export function registerPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  const gestartet = Date.now()
  let letzteEingabe: number | null = null
  let rueckkehr: { at: number; wegMs: number } | null = null
  let versteckt: number | null = document.visibilityState === 'hidden' ? gestartet : null
  let wartet = false
  // `let` statt `const updateSW = registerSW(…)`: die Handler unten dürfen
  // feuern, bevor die Zuweisung durch ist.
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null

  const anwenden = () => {
    if (!wartet || !updateSW) return
    const lage: UpdateLage = {
      jetzt: Date.now(), gestartet, letzteEingabe, rueckkehr,
      sichtbar: document.visibilityState === 'visible',
      dringend: isClientUpdateUrgent(), frei: canReloadNow(),
    }
    if (!updateJetztAnwenden(lage)) return
    wartet = false
    void updateSW(true)
  }

  const merkeEingabe = () => { letzteEingabe = Date.now() }
  for (const art of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(art, merkeEingabe, { capture: true, passive: true })
  }

  updateSW = registerSW({
    immediate: true,
    // Ein neuer Service Worker ist installiert und wartet — auch einer, der
    // schon aus der letzten Sitzung wartete (dann meldet er sich beim Start).
    onNeedRefresh() {
      wartet = true
      anwenden()
    },
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return

      // Die Registrierung selbst hat eben gerade geprüft.
      let zuletzt: number | null = Date.now()

      const checkForUpdate = (gedrosselt: boolean) => {
        // Nur pruefen, wenn die App im Vordergrund und online ist — sonst
        // laeuft update() ins Leere bzw. schlaegt offline fehl.
        if (document.visibilityState !== 'visible' || !navigator.onLine) return
        const jetzt = Date.now()
        if (gedrosselt && !updatePruefungFaellig(jetzt, zuletzt)) return
        zuletzt = jetzt
        void registration.update()
      }

      document.addEventListener('visibilitychange', () => {
        const jetzt = Date.now()
        if (document.visibilityState === 'hidden') {
          versteckt = jetzt
          return
        }
        if (versteckt !== null) rueckkehr = { at: jetzt, wegMs: jetzt - versteckt }
        versteckt = null
        // Wartet schon ein Update (gefunden, während die App im Hintergrund
        // war), greift es jetzt; sonst findet die Prüfung vielleicht eines,
        // und `onNeedRefresh` fragt dieselbe Regel innerhalb des Nachlaufs.
        anwenden()
        checkForUpdate(true)
      })
      // Wieder online: ungedrosselt, wer offline war, hat womöglich ein Update verpasst.
      window.addEventListener('online', () => checkForUpdate(false))

      // Backstop fuer lange im Vordergrund offene Tabs (z. B. Admin-Dashboard),
      // bei denen visibilitychange nie feuert.
      setInterval(() => checkForUpdate(false), 60 * 60 * 1000)
    },
  })

  // Leerlauf: jede Minute nachsehen, ob das wartende Update jetzt passt.
  setInterval(anwenden, 60 * 1000)
}
