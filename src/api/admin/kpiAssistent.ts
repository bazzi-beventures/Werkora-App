// Kennzahlen-Assistent — Modul `kpi_assistent`, docs/specs/kennzahlen-assistent.md.
//
// Wochenanalyse (Montag 08:00, je Mandant und ISO-Woche eine) und Chat über die
// Lese-Werkzeuge des Backends. Nur Management und Superadmin.
//
// Der Gesprächsverlauf lebt bewusst nur im Speicher des Reiters (Spec E8):
// kein localStorage — Finanzzahlen und Kundennamen bleiben nicht auf einem
// Handy liegen, und es entsteht kein neuer Key.

import { apiFetch, apiStreamFetch } from '../client'

export interface KpiReiter {
  /** Reiter-id im Kennzahlen-Screen; `rechnungen` = Rechnungen-Screen. */
  id: string
  label: string
}

export interface KpiHandlungsbedarf {
  titel: string
  text: string
  reiter: KpiReiter | null
}

export interface KpiAnalyse {
  gesamtbild: string
  veraenderungen: string[]
  handlungsbedarf: KpiHandlungsbedarf[]
}

export interface KpiVergleichWert {
  kennzahl: string
  label: string
  einheit: 'CHF' | 'Anzahl' | string
  vorwoche: number
  jetzt: number
  differenz: number
  veraendert: boolean
}

export type KpiBriefingStatus = 'laeuft' | 'fertig' | 'ki_fehlgeschlagen'

export interface KpiBriefingKurz {
  id: string
  iso_year: number
  iso_week: number
  status: KpiBriefingStatus
  created_at: string
  finished_at: string | null
}

export interface KpiBriefing extends KpiBriefingKurz {
  analysis: KpiAnalyse | null
  /** Werkzeug-Ergebnisse je Schlüssel, dazu `_vergleich` (Vorwoche). */
  snapshot: Record<string, unknown> & {
    _vergleich?: { basis: string | null; werte: KpiVergleichWert[] }
  }
}

export interface KpiBriefingListe {
  briefings: KpiBriefingKurz[]
  ki_hinweis: string
}

export function listKpiBriefings(): Promise<KpiBriefingListe> {
  return apiFetch<KpiBriefingListe>('/pwa/kpi-assistent/briefings')
}

export async function getKpiBriefing(id: string): Promise<KpiBriefing> {
  const res = await apiFetch<{ briefing: KpiBriefing }>(`/pwa/kpi-assistent/briefings/${encodeURIComponent(id)}`)
  return res.briefing
}

/** Analyse der laufenden Woche erstellen (oder nach gescheiterter KI wiederholen). */
export async function createKpiBriefing(): Promise<KpiBriefing> {
  const res = await apiFetch<{ briefing: KpiBriefing }>('/pwa/kpi-assistent/briefings', { method: 'POST' })
  return res.briefing
}

/** Eine Reihe eines Diagramms. `null` ist eine Lücke (Wert nicht berechenbar
 *  oder keine Zahlen), nie eine Null. `kontext` wird grau gezeichnet (Vorjahr). */
export interface KpiDiagrammReihe {
  name: string
  rolle: 'haupt' | 'kontext'
  werte: (number | null)[]
}

/** Diagramm aus dem Chat (services/kpi_diagramme.py, Spec §8 Phase 5). Die
 *  Daten baut der Server aus denselben Quellen wie die Reiter; das Modell hat
 *  nur Art und Parameter gewählt. */
export interface KpiDiagramm {
  art: string
  /** `saeulen`: senkrecht, Kategorien auf der x-Achse; `balken`: waagrecht, eine Reihe. */
  form: 'saeulen' | 'balken'
  titel: string
  untertitel: string
  einheit: 'CHF' | 'Stunden' | string
  kategorien: string[]
  reihen: KpiDiagrammReihe[]
  /** Je Kategorie ein kurzer Text (Anteil, Anzahl) für Tooltip und Tabelle. */
  zusatz: string[] | null
  hinweise: string[]
  reiter: KpiReiter
}

export type KpiChatEvent =
  | { type: 'tool'; label: string }
  | { type: 'delta'; text: string }
  | { type: 'chart'; chart: KpiDiagramm }
  | { type: 'links'; links: KpiReiter[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type KpiVerlaufEintrag = { role: 'user' | 'assistant'; text: string }

export async function* askKpiAssistent(
  question: string, briefingId: string | null, history: KpiVerlaufEintrag[],
): AsyncGenerator<KpiChatEvent, void, void> {
  for await (const ev of apiStreamFetch('/pwa/kpi-assistent/ask', {
    question, briefing_id: briefingId, history,
  })) {
    yield ev as KpiChatEvent
  }
}
