import { useEffect, useRef } from 'react'

/**
 * Registry für „diese Maske hat ungespeicherte Änderungen".
 *
 * Es ist im Admin immer höchstens EINE Detailmaske offen, darum reicht ein
 * einzelner aktiver Guard (kein Stack). Die Maske registriert sich per
 * `useUnsavedChangesGuard`, die Navigation (AdminApp) fragt vor jedem
 * Screen-Wechsel per `dirtyGuard()` nach und zeigt bei Bedarf die
 * Speichern-/Verwerfen-Abfrage.
 */
export interface UnsavedChangesGuard {
  /** true, solange die Maske ungespeicherte Änderungen enthält. */
  isDirty: () => boolean
  /** Speichert die Maske. false = fehlgeschlagen (Navigation abbrechen). */
  save: () => Promise<boolean>
  /**
   * Darf die Abfrage «Speichern» anbieten? Fehlt die Funktion, ja.
   *
   * Nicht jede offene Eingabe lässt sich sinnvoll speichern: steht über dem
   * Projekt-Detail die Rapport-Maske und ist halb ausgefüllt, wäre «Speichern»
   * entweder wirkungslos (es speicherte das Projektformular darunter) oder falsch
   * (ein halber Rapport ist ein Beleg mit Geldfolge). Dann bleiben Verwerfen und
   * Zurück-zur-Maske.
   */
  canSave?: () => boolean
}

let active: UnsavedChangesGuard | null = null

/** Der aktive Guard — aber nur, wenn er gerade wirklich ungespeicherte Änderungen hat. */
export function dirtyGuard(): UnsavedChangesGuard | null {
  return active && active.isDirty() ? active : null
}

/** Registriert den Guard und liefert die Abmeldefunktion. */
export function registerUnsavedChangesGuard(guard: UnsavedChangesGuard): () => void {
  active = guard
  // Nur den eigenen Guard abmelden: beim Screen-Wechsel montiert React die neue
  // Maske, BEVOR die alte aufräumt — ohne diese Prüfung würde die alte Maske den
  // Guard der neuen löschen.
  return () => { if (active === guard) active = null }
}

/** Nur für Tests: Registry zwischen Fällen leeren. */
export function resetUnsavedChangesGuard(): void {
  active = null
}

/**
 * Meldet die aufrufende Maske als Guard an und warnt zusätzlich beim
 * Schliessen/Neuladen des Browser-Tabs.
 */
export function useUnsavedChangesGuard(
  isDirty: () => boolean,
  save: () => Promise<boolean>,
  canSave?: () => boolean,
): void {
  const isDirtyRef = useRef(isDirty)
  const saveRef = useRef(save)
  const canSaveRef = useRef(canSave)
  // Nach jedem Render aktualisieren — die Callbacks werden immer erst danach
  // (aus Event-Handlern) aufgerufen und sehen so nie einen alten Render-Stand.
  useEffect(() => { isDirtyRef.current = isDirty; saveRef.current = save; canSaveRef.current = canSave })

  useEffect(() => {
    const guard: UnsavedChangesGuard = {
      isDirty: () => isDirtyRef.current(),
      save: () => saveRef.current(),
      canSave: () => canSaveRef.current?.() ?? true,
    }
    const unregister = registerUnsavedChangesGuard(guard)

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!guard.isDirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      unregister()
    }
  }, [])
}
