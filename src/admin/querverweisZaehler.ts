// Querverweis-Zähler der Admin-App — Spec docs/specs/querverweis-zaehler.md.
//
// Frage: Welche Sprünge zwischen den Screens werden benutzt (etwa «Projekt →
// Einsatzplanung»), und kommt man über einen Verweis im Screen oder übers Menü
// ans Ziel? Gezählt wird zentral in AdminApp, nicht an jedem Link: jeder
// Sprung läuft dort durch `guardedNav`, ein neuer Verweis ist damit ohne
// eigenes Zutun dabei.
//
// Ohne Personenbezug: gesendet werden nur (von, nach, Weg, Anzahl) — kein
// Konto, kein Zeitpunkt. Den Mandanten und den Tag setzt der Server.
//
// Unsichtbar und billig: gesammelt wird im Arbeitsspeicher, abgeliefert
// höchstens einmal pro Minute und beim Verlassen der Seite (`keepalive`).
// Geht etwas schief, ist der Block verloren — bewusst kein `apiFetch`: ein
// Zähler darf weder die Verbindungsanzeige noch den Sitzungsablauf auslösen,
// und kein localStorage (keine Daten auf dem Gerät, keine APP_DATA_VERSION).

import type { AdminScreen } from './useAdminNav'

export type SprungWeg = 'link' | 'menu' | 'hilfe'

export interface Sprung {
  von: AdminScreen
  nach: AdminScreen
  weg: SprungWeg
  anzahl: number
}

/** Takt der Ablieferung — ein Request pro Minute und Tab, solange geklickt wird. */
export const ABLIEFERN_MS = 60_000
/** Deckel wie im Server (agents/routers/admin_querverweise.py). */
export const MAX_EINTRAEGE = 200
export const MAX_ANZAHL = 500

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const puffer = new Map<string, Sprung>()
let timer: ReturnType<typeof setTimeout> | null = null
let angemeldet = false

/** Einen Sprung merken. Ein Sprung auf denselben Screen ist keiner. */
export function zaehleSprung(von: AdminScreen, nach: AdminScreen, weg: SprungWeg): void {
  if (von === nach) return
  const key = `${von}|${nach}|${weg}`
  const bisher = puffer.get(key)
  if (bisher) {
    bisher.anzahl = Math.min(bisher.anzahl + 1, MAX_ANZAHL)
  } else {
    if (puffer.size >= MAX_EINTRAEGE) return
    puffer.set(key, { von, nach, weg, anzahl: 1 })
  }
  beimVerlassenAbliefern()
  if (timer === null) {
    timer = setTimeout(() => { timer = null; liefereAb() }, ABLIEFERN_MS)
  }
}

/** Den gesammelten Block herausnehmen und den Puffer leeren. */
export function nimmBlock(): Sprung[] {
  const block = [...puffer.values()]
  puffer.clear()
  return block
}

/** Den Block an den Server schicken — feuern und vergessen. */
export function liefereAb(): void {
  if (timer !== null) { clearTimeout(timer); timer = null }
  const eintraege = nimmBlock()
  if (eintraege.length === 0) return
  try {
    fetch(`${BASE_URL}/pwa/admin/querverweise`, {
      method: 'POST',
      credentials: 'include',
      // Überlebt das Schliessen des Tabs; die 64-kB-Grenze von keepalive
      // erreicht ein Block (höchstens 200 kurze Einträge) nie.
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eintraege }),
    }).catch(() => { /* Zähler: verloren ist verloren */ })
  } catch { /* fetch fehlt (Test, sehr alter Browser) */ }
}

function beimVerlassenAbliefern(): void {
  if (angemeldet || typeof window === 'undefined') return
  angemeldet = true
  // `visibilitychange` ist am Handy das letzte sichere Ereignis (App in den
  // Hintergrund); `pagehide` deckt das Schliessen am Desktop ab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') liefereAb()
  })
  window.addEventListener('pagehide', liefereAb)
}
