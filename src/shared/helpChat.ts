/**
 * Reine Helfer des Hilfe-Chats (Spec docs/specs/hilfe-bot-masken-und-ablaeufe.md).
 * Eigene Datei, damit HelpBot.tsx nur die Komponente exportiert (Fast Refresh).
 */
import type { HelpHistoryItem, HelpSource } from '../api/help'

export interface HelpMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  error?: string
  /** Handbuch-Abschnitte, auf die sich die Antwort stützt. */
  sources?: HelpSource[]
}

/** Verlauf, der mit einer Frage mitgeht (Spec D5): die letzten drei
 *  vollständigen Wortwechsel. Fehlgeschlagene oder leere Antworten fallen
 *  samt ihrer Frage weg — sie würden das Modell nur verwirren. Der Server
 *  kürzt noch einmal; massgeblich ist er. */
export const HISTORY_MESSAGES = 6
export const HISTORY_CHARS = 1500

export function historyFor(messages: HelpMessage[]): HelpHistoryItem[] {
  const out: HelpHistoryItem[] = []
  for (let i = 0; i + 1 < messages.length; i++) {
    const q = messages[i]
    const a = messages[i + 1]
    if (q.role !== 'user' || a.role !== 'assistant') continue
    if (a.error || !a.text.trim()) continue
    out.push({ role: 'user', text: q.text.slice(0, HISTORY_CHARS) })
    out.push({ role: 'assistant', text: a.text.slice(0, HISTORY_CHARS) })
    i++
  }
  return out.slice(-HISTORY_MESSAGES)
}

/** Quellen zum Anzeigen: Anzeigename, dedupliziert, höchstens drei. */
export function sourceLabels(sources: HelpSource[] | undefined): string[] {
  const seen: string[] = []
  for (const s of sources ?? []) {
    const label = (s.label || s.section || '').trim()
    if (label && !seen.includes(label)) seen.push(label)
    if (seen.length === 3) break
  }
  return seen
}
