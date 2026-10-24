import { dirtyGuard } from '../admin/unsavedChanges'

/**
 * Darf die App gerade neu laden, ohne jemandem etwas wegzunehmen?
 * (docs/specs/pwa-neuladen.md §3.1)
 *
 * Seit `registerType: 'prompt'` aktiviert die App ein neues Update selbst — und
 * nur, wenn diese Frage mit Ja beantwortet ist. Sie bündelt alles, was ein
 * Reload kaputtmachen würde:
 *
 * - eine Admin-Maske mit ungespeicherten Änderungen (`admin/unsavedChanges.ts`),
 * - einen angefangenen Rapport im Chat (meldet sich als Blocker an,
 *   `ChatScreen.tsx` über `rapportLeaveWarning`),
 * - einen laufenden schreibenden Request — Upload, Rapport aus der
 *   Offline-Warteschlange, Speichern (gezählt in `api/client.ts`),
 * - ein Eingabefeld, in dem gerade jemand tippt.
 *
 * Im Zweifel NEIN: ein verpasster Reload kostet nichts (das Update wartet auf
 * die nächste Gelegenheit), ein falscher kostet einen halben Rapport.
 */

type Blocker = () => boolean

const blockers = new Set<Blocker>()
let mutationsInFlight = 0
let urgent = false

/** Vom `/pwa/me`-Aufruf gesetzt (api/auth.ts): ein dringendes Update greift
 *  bei der nächsten Rückkehr ohne die 30 Minuten (registerSW.ts). Hier statt in
 *  registerSW.ts, damit auth.ts nicht am Service-Worker-Modul hängt. */
export function setClientUpdateUrgent(value: boolean): void { urgent = value }
export function isClientUpdateUrgent(): boolean { return urgent }

/** Meldet eine Bedingung an, die einen Reload verbietet, solange sie `true`
 *  liefert. Rückgabe: Abmeldefunktion. */
export function registerReloadBlocker(blocker: Blocker): () => void {
  blockers.add(blocker)
  return () => { blockers.delete(blocker) }
}

/** Ein schreibender Request beginnt bzw. endet (api/client.ts). */
export function beginMutation(): void { mutationsInFlight += 1 }
export function endMutation(): void { mutationsInFlight = Math.max(0, mutationsInFlight - 1) }

/** Tippt gerade jemand? Ein fokussiertes, nicht leeres Eingabefeld zählt — ein
 *  leeres fokussiertes Suchfeld nicht, das verliert beim Reload nichts. */
function editingField(): boolean {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return el.value.trim() !== ''
  if (el instanceof HTMLInputElement) {
    const ohneText = ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image']
    return !ohneText.includes(el.type) && el.value.trim() !== ''
  }
  return el instanceof HTMLElement && el.isContentEditable
}

export function canReloadNow(): boolean {
  if (mutationsInFlight > 0) return false
  if (dirtyGuard()) return false
  for (const blocker of blockers) {
    try {
      if (blocker()) return false
    } catch {
      // Ein Blocker, der selbst scheitert, weiss nicht, ob etwas verloren
      // ginge — also lieber nicht neu laden.
      return false
    }
  }
  return !editingField()
}

/** Nur für Tests. */
export function resetReloadGuard(): void {
  blockers.clear()
  mutationsInFlight = 0
  urgent = false
}
