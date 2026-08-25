// Der localStorage-Entwurf des Erstell-Formulars als Hook (Charge H2).
//
// Drei Effekte, die zusammengehören und im Screen verstreut standen:
// beim Öffnen (bzw. Projektwechsel) einen vorhandenen Entwurf übernehmen,
// bei jeder Änderung speichern, und die Frage «ist überhaupt etwas drin?»
// beantworten — davon hängt ab, ob das Verlassen nachfragt.
//
// Bewusst „Entwurf zuerst": übernommen wird ohne Rückfrage, entschieden wird
// erst beim Verlassen. Wer die Frage beim Öffnen falsch wegklickt, verlöre sonst
// seine Eingaben.

import { useEffect, useState } from 'react'
import { loadQuoteDraft, quoteDraftHasContent, removeQuoteDraft, saveQuoteDraft } from './quoteDraft'
import type { QuoteDraft, SkontoDefaults } from './quoteDraft'

export interface QuoteDraftState {
  /** Zeitstempel des übernommenen Entwurfs (null = keiner übernommen) — nur für
   *  den Hinweis «Entwurf vom … übernommen». */
  restoredAt: number | null
  /** Leeres Formular: nichts zu verlieren, also keine Rückfrage beim Verlassen. */
  isPristine: boolean
  /** Entwurf wegwerfen (Verwerfen-Knopf, «Leer starten», nach dem Speichern). */
  drop: () => void
}

export function useQuoteDraft(opts: {
  draftKey: string
  stdNotes: string
  skontoDefaults: SkontoDefaults
  serialize: () => QuoteDraft
  apply: (d: QuoteDraft) => void
}): QuoteDraftState {
  const { draftKey, stdNotes, skontoDefaults, serialize, apply } = opts
  const [restoredAt, setRestoredAt] = useState<number | null>(null)

  const snapshot = serialize()
  const isPristine = !quoteDraftHasContent(snapshot, stdNotes, skontoDefaults)
  // Als Effekt-Dependency: feuert genau dann, wenn sich am Inhalt etwas ändert.
  const serialized = JSON.stringify(snapshot)

  // Gespeicherten Entwurf für den aktuellen Projekt-Slot übernehmen (Mount und
  // Projektwechsel). Nur in ein leeres Formular: wer im freien Formular erst tippt
  // und dann das Projekt umstellt, darf seine Eingaben nicht verlieren.
  useEffect(() => {
    setRestoredAt(null)
    if (!isPristine) return
    const stored = loadQuoteDraft(draftKey)
    if (!stored) return
    apply(stored.data)
    setRestoredAt(stored.savedAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Laufend speichern, sobald nennenswerter Inhalt da ist. Ein leeres Formular
  // wird bewusst NICHT geschrieben/gelöscht — sonst überschriebe der Mount mit
  // Leerstand einen vorhandenen Entwurf, bevor er wiederhergestellt ist.
  useEffect(() => {
    if (isPristine) return
    saveQuoteDraft(draftKey, snapshot, Date.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, serialized, isPristine])

  return {
    restoredAt,
    isPristine,
    drop: () => { removeQuoteDraft(draftKey); setRestoredAt(null) },
  }
}
