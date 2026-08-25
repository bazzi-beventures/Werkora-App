import { KleinmaterialSelection } from './KleinmaterialPrompt'
import { ErsatzteilSelection } from './ErsatzteilPrompt'
import { DisambiguationOption, SummaryItem } from '../api/chat'

// Zwischenspeicher für einen in Arbeit befindlichen Rapport. Der ChatScreen hält
// seinen State sonst nur im Speicher und verliert alles beim Unmount (Navigation
// zur Hauptmaske). Dieser Draft überlebt Navigation und Reload, damit ein
// angefangener Rapport nicht neu eingegeben werden muss.

export interface DraftMessage {
  id: number
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
  action_taken?: string | null
  disambiguation?: DisambiguationOption[]
}

export interface RapportDraftState {
  messages: DraftMessage[]
  kleinCollected: boolean
  ersatzCollected: boolean
  collectedKlein: KleinmaterialSelection | null
  collectedErsatz: ErsatzteilSelection[]
  // Hauptmaterialien aus der Zusammenfassung — für die Gesamt-Übersicht vor dem
  // Speichern (zusammen mit Klein-/Ersatzteilen), damit die Anzeige dem PDF entspricht.
  summaryItems: SummaryItem[]
  pendingConfirm: boolean
  pendingDisambiguation: boolean
  pendingQuoteQuestion: boolean
  pendingSignReportId: number | null
  downloadReportId: number | null
  // Projekt des laufenden Rapports. Wird beim Start aus dem Projekt-Detail gesetzt —
  // nicht erst mit der Zusammenfassung: der Rapport gehört ab dem ersten Klick zu
  // einem Auftrag, nicht erst ab dem Bestätigungsschritt. `pending_summary.project`
  // bestätigt ihn später bzw. korrigiert ihn, wenn der Monteur im Gespräch gewechselt
  // hat. Trägt die Rückfrage in planRapportStart: tippt der Monteur im selben Projekt
  // erneut auf «Rapport erstellen», springt er in seinen laufenden Rapport statt ihn
  // zu verwerfen. Fehlt im Draft (ältere Version) → es wird gefragt.
  pendingProject?: string | null
  // Wurde der gespeicherte Rapport vom Kunden unterschrieben (statt übersprungen)?
  // Steuert, ob der Monteur ihn im Abschluss-Schritt noch selbst löschen darf —
  // nach der Unterschrift ist er abgenommen. Fehlt im Draft (ältere Version),
  // gilt "nicht unterschrieben"; der Server prüft es ohnehin selbst nach.
  reportSigned?: boolean
  // Leistungsart-Zwischenschritt (reports.art_der_arbeit). Alle drei optional:
  // ein Draft aus einer älteren App-Version hat sie nicht, dann beginnt der Schritt
  // wieder von vorn — das ist ein Klick, kein Datenverlust.
  workTypesCollected?: boolean
  collectedWorkTypes?: string[]
  suggestedWorkTypes?: string[]
  // Abschluss-Wahl des Bestätigungsschritts: Teilrapport statt Unterschrift jetzt
  // (docs/specs/teilrapport.md §6.1). Ohne den Draft wäre die Auswahl nach einem
  // Navigationswechsel weg. Reines ZUSATZfeld — kein APP_DATA_VERSION-Schritt
  // nötig (siehe CLAUDE.md: nur Umbenennen/Entfernen/Shape-Änderung verlangt eine
  // Migration); ältere Entwürfe lesen `undefined` und beginnen bei «Unterschrift
  // jetzt», der Vorauswahl-Default.
  partialChosen?: boolean
  // Der zuletzt gespeicherte Rapport war ein Teilrapport — dann zeigt der
  // Abschluss den Hinweis statt des Unterschriftspads.
  savedAsPartial?: boolean
}

interface StoredDraft extends RapportDraftState {
  savedAt: number
}

// Entwürfe, die älter als das sind, gelten als abgelaufen und werden verworfen —
// verhindert, dass ein tagealter Rapport-Zwischenstand wieder auftaucht. Die Frist
// läuft ab der letzten Änderung, nicht ab dem Start: wer am Rapport arbeitet,
// verliert ihn nicht. Serverseitig hat die Projekt-Bindung dieselbe Lebensdauer
// (_ACTIVE_PROJECT_TTL in services/pwa_chat_service.py) — die beiden müssen
// zusammen verfallen, sonst zeigt die PWA einen Rapport an, dessen Projekt der
// Server nicht mehr kennt.
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000  // 12 Stunden

// Gleiche Prefix-Konvention wie `quote-draft:` (Offert-Zwischenstand). Pro
// Mitarbeiter geschlüsselt, damit auf einem geteilten Gerät kein Draft leakt.
export function draftKey(userId: string): string {
  return `rapport-draft:${userId}`
}

// Ist der Zustand "leer" (nur die Begrüssung, nichts gesammelt/pending)? Solche
// Zustände müssen nicht persistiert werden — und ein zurückgesetzter ChatScreen
// löscht so den Draft automatisch wieder.
export function isEmptyDraft(d: RapportDraftState): boolean {
  const onlyGreeting = d.messages.length <= 1
  const nothingCollected = !d.collectedKlein && d.collectedErsatz.length === 0
  const nothingPending = !d.pendingConfirm && !d.pendingDisambiguation &&
    !d.pendingQuoteQuestion && d.pendingSignReportId === null && d.downloadReportId === null
  // Ein zugeordnetes Projekt macht den Entwurf für sich genommen schon nicht mehr
  // leer: der Monteur hat auf «Rapport erstellen» getippt, und genau diese Bindung
  // muss den Weg zur Hauptmaske und zurück überleben.
  return onlyGreeting && nothingCollected && nothingPending && !d.pendingProject
}

export function saveDraft(userId: string, state: RapportDraftState, now: number): void {
  try {
    if (isEmptyDraft(state)) { localStorage.removeItem(draftKey(userId)); return }
    const stored: StoredDraft = { ...state, savedAt: now }
    localStorage.setItem(draftKey(userId), JSON.stringify(stored))
  } catch {
    // Storage voll / privat / blockiert — Persistenz ist best-effort.
  }
}

export function loadDraft(userId: string, now: number): RapportDraftState | null {
  try {
    const raw = localStorage.getItem(draftKey(userId))
    if (!raw) return null
    const d = JSON.parse(raw) as StoredDraft
    if (!d || !Array.isArray(d.messages)) return null
    if (typeof d.savedAt !== 'number' || now - d.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(draftKey(userId))
      return null
    }
    return d
  } catch {
    return null
  }
}

export function clearDraft(userId: string): void {
  try { localStorage.removeItem(draftKey(userId)) } catch { /* best-effort */ }
}
