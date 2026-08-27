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
  projectId: string
  tab: ProjectTab
}

// Muss zu PROJECT_TABS in services/app_links.py passen; ein Python-Test hält
// beide Listen gegen ProjectTabBar.tsx.
const TABS: readonly ProjectTab[] = [
  'details', 'tasks', 'documents', 'supplier', 'quotes',
  'reports', 'invoices', 'approvals', 'status',
]

// #/admin/projects/<id>[/<tab>]
const PATTERN = /^#\/admin\/projects\/([^/?#]+)(?:\/([a-z]+))?/

/**
 * Liest einen Projekt-Deep-Link aus einem Hash. Rein — der Rest des Moduls
 * hängt an `window`, diese Funktion nicht, damit sie testbar bleibt.
 *
 * Ein unbekannter Reiter fällt auf `details` zurück statt den ganzen Sprung zu
 * verwerfen: das Projekt ist die Hauptsache, der Reiter die Feinheit.
 */
export function parseDeepLink(hash: string): ProjectDeepLink | null {
  const m = PATTERN.exec(hash || '')
  if (!m) return null
  let projectId: string
  try {
    projectId = decodeURIComponent(m[1])
  } catch {
    // Kaputt kodierte Adresse (abgeschnittener %-Escape aus einem Mailclient):
    // lieber kein Sprung als einer auf eine erfundene id.
    return null
  }
  if (!projectId.trim()) return null
  const tab = TABS.find(t => t === m[2]) ?? 'details'
  return { projectId: projectId.trim(), tab }
}

let pending: ProjectDeepLink | null = null

/**
 * Beim App-Start einmal aufrufen (aus einem Effekt, nicht im Render).
 *
 * Der Hash wird dabei aus der Adresszeile entfernt: ein Reload soll denselben
 * Sprung nicht wiederholen — wer im Projekt weiternavigiert und dann F5
 * drückt, landete sonst immer wieder auf demselben Reiter.
 */
export function captureDeepLink(hash: string = window.location.hash): ProjectDeepLink | null {
  const link = parseDeepLink(hash)
  if (!link) return null
  pending = link
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return link
}

/** Den gemerkten Sprung holen und verbrauchen. Zweiter Aufruf liefert null. */
export function takeDeepLink(): ProjectDeepLink | null {
  const link = pending
  pending = null
  return link
}
