// Reine Helfer des Reiters «Assistent» (docs/specs/kennzahlen-assistent.md §3.2).
// Ohne React/DOM, unit-getestet in assistent.test.ts.

import type {
  KpiAnalyse, KpiBriefingKurz, KpiReiter, KpiVergleichWert, KpiVerlaufEintrag,
} from '../../api/admin/kpiAssistent'

export interface ChatNachricht {
  id: number
  role: 'user' | 'assistant'
  text: string
  error?: string
  /** Reiter der Werkzeuge, auf die sich die Antwort stützt. */
  links?: KpiReiter[]
}

/** Wie viele Nachrichten mit einer Frage mitgehen. Der Server kürzt noch einmal
 *  (services/kpi_assistent.MAX_VERLAUF); massgeblich ist er. */
export const VERLAUF_NACHRICHTEN = 10
export const VERLAUF_ZEICHEN = 1500

/** Verlauf für die nächste Frage: nur vollständige Wortwechsel — eine
 *  gescheiterte oder leere Antwort fällt samt ihrer Frage weg. */
export function verlaufFuer(nachrichten: ChatNachricht[]): KpiVerlaufEintrag[] {
  const out: KpiVerlaufEintrag[] = []
  for (let i = 0; i + 1 < nachrichten.length; i++) {
    const frage = nachrichten[i]
    const antwort = nachrichten[i + 1]
    if (frage.role !== 'user' || antwort.role !== 'assistant') continue
    if (antwort.error || !antwort.text.trim()) continue
    out.push({ role: 'user', text: frage.text.slice(0, VERLAUF_ZEICHEN) })
    out.push({ role: 'assistant', text: antwort.text.slice(0, VERLAUF_ZEICHEN) })
    i++
  }
  return out.slice(-VERLAUF_NACHRICHTEN)
}

const STANDARD_FRAGEN = [
  'Wie steht die Pipeline?',
  'Welche Rechnungen sind überfällig?',
  'Wie hat sich die Marge entwickelt?',
] as const

/** Bis zu drei Vorschlagsfragen: zuerst zu den Punkten mit Handlungsbedarf,
 *  aufgefüllt mit Standardfragen. Im Code gebaut, nicht vom Modell. */
export function vorschlaege(analyse: KpiAnalyse | null | undefined): string[] {
  const out: string[] = []
  for (const punkt of analyse?.handlungsbedarf ?? []) {
    const titel = punkt.titel.trim()
    if (titel) out.push(`Mehr dazu: ${titel}`)
    if (out.length === 2) break
  }
  for (const frage of STANDARD_FRAGEN) {
    if (out.length === 3) break
    out.push(frage)
  }
  return out
}

/** ISO-8601-Woche eines Datums (Montag = erster Tag, KW 1 enthält den 4. Januar). */
export function isoWoche(d: Date): { jahr: number; woche: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const tag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - tag)
  const jahrBeginn = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const woche = Math.ceil(((t.getTime() - jahrBeginn.getTime()) / 86_400_000 + 1) / 7)
  return { jahr: t.getUTCFullYear(), woche }
}

/** Die Analyse der laufenden Woche, falls es sie gibt (in jedem Status). */
export function briefingDerWoche(liste: KpiBriefingKurz[], heute: Date): KpiBriefingKurz | null {
  const { jahr, woche } = isoWoche(heute)
  return liste.find(b => b.iso_year === jahr && b.iso_week === woche) ?? null
}

/** Was der Knopf über der Analyse anbietet: erstellen (keine Analyse dieser
 *  Woche), wiederholen (KI gescheitert) oder nichts (fertig oder läuft). */
export function erstellAngebot(liste: KpiBriefingKurz[], heute: Date): 'erstellen' | 'wiederholen' | null {
  const aktuell = briefingDerWoche(liste, heute)
  if (!aktuell) return 'erstellen'
  return aktuell.status === 'ki_fehlgeschlagen' ? 'wiederholen' : null
}

export function wochenLabel(b: Pick<KpiBriefingKurz, 'iso_year' | 'iso_week'>): string {
  return `KW ${b.iso_week} ${b.iso_year}`
}

function zahl(v: number, einheit: string): string {
  const text = v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: einheit === 'CHF' ? 0 : 1 })
  return einheit === 'CHF' ? `CHF ${text}` : text
}

/** «Offene Rechnungen: 5 → 7 (+2)» — für die Rohwerte, wenn die KI fehlt. */
export function vergleichZeile(w: KpiVergleichWert): string {
  const diff = w.differenz
  const vorzeichen = diff > 0 ? '+' : diff < 0 ? '−' : '±'
  const betrag = zahl(Math.abs(diff), w.einheit)
  return `${w.label}: ${zahl(w.vorwoche, w.einheit)} → ${zahl(w.jetzt, w.einheit)} (${vorzeichen}${betrag})`
}

/** Der Sprung aus der Montags-Push kommt als `detailId` des Kennzahlen-Screens:
 *  `assistent` (jüngste Analyse) oder `assistent:<briefing_id>` (AdminApp). */
export function parseAssistentLink(detailId: string | null | undefined): { briefingId: string | null } | null {
  if (!detailId || (detailId !== 'assistent' && !detailId.startsWith('assistent:'))) return null
  const id = detailId.slice('assistent:'.length)
  return { briefingId: id || null }
}
