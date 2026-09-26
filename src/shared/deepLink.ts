// Deep-Links aus einer E-Mail zurück in die App.
//
// Die internen Info-Mails ans Firmen-Postfach (Offerte angenommen, Rapport
// eingereicht, keine Rückmeldung) tragen einen Button, der nicht bloss die App
// öffnet, sondern das Projekt — und dort den Reiter, um den es geht. Gebaut
// wird die Adresse im Backend (`services/app_links.py`), gelesen wird sie hier.
//
// Warum alles hinter dem `#` steht: die PWA liegt als statische Datei hinter
// GitHub Pages und hat keinen History-Router. Ein Pfad wie `/admin/projects/…`
// wäre serverseitig ein 404 — der Hash dagegen erreicht den Server gar nicht.
//
// Warum ein Modul-Zwischenspeicher statt eines Props durch den Baum: zwischen
// dem Klick in der Mail und dem Moment, in dem die Admin-App überhaupt steht,
// liegt im Zweifel ein ganzer Login (Kaltstart, abgelaufene Sitzung). Der
// Sprung muss diese Zeit überdauern, ohne dass jeder Screen dazwischen davon
// wissen muss.

import type { ProjectTab } from '../admin/operative/projectDetail/ProjectTabBar'

export interface ProjectDeepLink {
  kind: 'project'
  projectId: string
  tab: ProjectTab
}

/**
 * Eine Zählung, direkt (`#/inventur/<count_id>`).
 *
 * Bewusst **ohne** `/admin/`: Dieselbe Adresse landet je nach Rolle in der
 * Admin-App (Reiter Inventur mit geöffneter Zählung) oder in der Monteur-PWA
 * (Inventur-Screen) — ein Inventurmanager mit Rolle `user` kommt gar nicht in
 * die Admin-App. Wer wohin gehört, entscheidet `App.tsx` nach dem Login, nicht
 * die Adresse (docs/specs/rollierende-inventur.md §10.1).
 */
export interface CountDeepLink {
  kind: 'count'
  countId: string
}

export type DeepLink = ProjectDeepLink | CountDeepLink

// Muss zu PROJECT_TABS in services/app_links.py passen; ein Python-Test hält
// beide Listen gegen ProjectTabBar.tsx.
const TABS: readonly ProjectTab[] = [
  'details', 'tasks', 'documents', 'supplier', 'quotes',
  'reports', 'invoices', 'approvals', 'warranty', 'status',
]

// #/admin/projects/<id>[/<tab>]
const PATTERN = /^#\/admin\/projects\/([^/?#]+)(?:\/([a-z]+))?/

// #/inventur/<count_id>
const COUNT_PATTERN = /^#\/inventur\/([^/?#]+)/

/** Ein Pfadstück aus dem Hash — oder null, wenn es kaputt kodiert oder leer
 *  ist. Ein abgeschnittener %-Escape aus einem Mailclient soll keinen Sprung
 *  auf eine erfundene id auslösen. */
function idAus(roh: string): string | null {
  try {
    const wert = decodeURIComponent(roh).trim()
    return wert || null
  } catch {
    return null
  }
}

/**
 * Liest einen Projekt-Deep-Link aus einem Hash. Rein — der Rest des Moduls
 * hängt an `window`, diese Funktion nicht, damit sie testbar bleibt.
 *
 * Ein unbekannter Reiter fällt auf `details` zurück statt den ganzen Sprung zu
 * verwerfen: das Projekt ist die Hauptsache, der Reiter die Feinheit.
 */
export function parseDeepLink(hash: string): DeepLink | null {
  const c = COUNT_PATTERN.exec(hash || '')
  if (c) {
    const countId = idAus(c[1])
    return countId ? { kind: 'count', countId } : null
  }
  const m = PATTERN.exec(hash || '')
  if (!m) return null
  const projectId = idAus(m[1])
  if (!projectId) return null
  const tab = TABS.find(t => t === m[2]) ?? 'details'
  return { kind: 'project', projectId, tab }
}

let pending: DeepLink | null = null

/**
 * Beim App-Start einmal aufrufen (aus einem Effekt, nicht im Render).
 *
 * Der Hash wird dabei aus der Adresszeile entfernt: ein Reload soll denselben
 * Sprung nicht wiederholen — wer im Projekt weiternavigiert und dann F5
 * drückt, landete sonst immer wieder auf demselben Reiter.
 */
export function captureDeepLink(hash: string = window.location.hash): DeepLink | null {
  const link = parseDeepLink(hash)
  if (!link) return null
  pending = link
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return link
}

/**
 * Einen Sprung merken, ohne die Adresszeile anzufassen.
 *
 * Für Push-Benachrichtigungen: Steht die App schon offen, kommt die Meldung als
 * Nachricht vom Service Worker, nicht als Hash — die Adresszeile weiss nichts
 * davon. `true`, wenn die Adresse ein bekannter Sprung war.
 */
export function rememberDeepLink(url: string): boolean {
  const hash = url.slice(url.indexOf('#'))
  const link = url.includes('#') ? parseDeepLink(hash) : null
  if (!link) return false
  pending = link
  return true
}

/** Den gemerkten Sprung holen und verbrauchen. Zweiter Aufruf liefert null. */
export function takeDeepLink(): DeepLink | null {
  const link = pending
  pending = null
  return link
}

/** Nur den Inventur-Sprung holen (`App.tsx`). Ein Projekt-Sprung bleibt liegen
 *  — den holt die Admin-App ab, sobald sie steht. */
export function takeCountDeepLink(): CountDeepLink | null {
  if (pending?.kind !== 'count') return null
  const link = pending
  pending = null
  return link
}

/** Nur den Projekt-Sprung holen (Admin-App). Ein Inventur-Sprung bleibt liegen
 *  — den führt `App.tsx` aus, weil er die Zählmaske beider Rollen öffnet. */
export function takeProjectDeepLink(): ProjectDeepLink | null {
  if (pending?.kind !== 'project') return null
  const link = pending
  pending = null
  return link
}
