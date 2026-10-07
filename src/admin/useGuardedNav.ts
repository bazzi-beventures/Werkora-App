import { useRef, useState } from 'react'
import type { AdminScreen } from './useAdminNav'
import { dirtyGuard } from './unsavedChanges'

export interface PendingNav {
  screen: AdminScreen
  detailId?: string
  /** Darf die Abfrage «Speichern» anbieten? Beim Öffnen festgehalten, nicht im Render gefragt. */
  allowSave: boolean
}

/**
 * Navigation mit Rückfrage bei ungespeicherten Änderungen (Sidebar, MobileNav,
 * Zurück-Taste, Sprünge aus dem Hilfe-Chat).
 *
 * Zwei Regeln, beide aus der Support-Meldung vom 2026-10-07 («Speichern…» hing):
 *
 * - **Beim «Speichern» geht die Abfrage zuerst zu, dann wird gespeichert.** Das
 *   Speichern der Projektmaske kann unterwegs nachfragen («Kein Projektleiter»,
 *   «Projekt-Team geändert»). Diese Rückfragen zeichnet die Maske — im Baum VOR
 *   dieser Abfrage, bei gleichem z-index also darunter. Blieb die Abfrage offen,
 *   lag die Rückfrage verdeckt darunter, das Speichern wartete für immer auf eine
 *   Antwort, und alle Knöpfe der Abfrage waren gesperrt.
 * - **`dirtyGuard()` wird nie im Render gefragt.** `isDirty` der Projektmaske stösst
 *   ein Autosave an; im Render hiesse das ein Request je Neuzeichnen, solange die
 *   Abfrage offen ist. Ob «Speichern» angeboten wird, steht deshalb in `pending`.
 *
 * Navigiert wird nach dem Speichern nur, wenn es geklappt hat und der Anwender
 * zwischenzeitlich nicht schon woandershin geklickt hat.
 */
export function useGuardedNav(nav: (screen: AdminScreen, detailId?: string) => void) {
  const [pending, setPending] = useState<PendingNav | null>(null)
  const navSeq = useRef(0)

  function guardedNav(screen: AdminScreen, detailId?: string) {
    navSeq.current += 1
    const guard = dirtyGuard()
    if (guard) {
      setPending({ screen, detailId, allowSave: guard.canSave?.() !== false })
      return
    }
    nav(screen, detailId)
  }

  function discard() {
    const target = pending
    setPending(null)
    if (target) nav(target.screen, target.detailId)
  }

  function cancel() {
    setPending(null)
  }

  async function save() {
    const target = pending
    setPending(null)
    if (!target) return
    const guard = dirtyGuard()
    if (!guard) { nav(target.screen, target.detailId); return }
    const seq = navSeq.current
    const ok = await guard.save().catch(() => false)
    // Fehlgeschlagen oder abgebrochen: der Anwender bleibt, die Maske zeigt warum.
    if (ok && navSeq.current === seq) nav(target.screen, target.detailId)
  }

  return { pending, guardedNav, save, discard, cancel }
}
