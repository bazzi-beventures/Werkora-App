import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { UseProjectForm } from './useProjectForm'

// Die Projektmaske speichert sich selbst (docs/specs/projektmaske-autosave.md).
//
// Dieser Hook sagt nur, WANN gespeichert wird — WAS rausgeht, entscheidet
// `useProjectForm.persistAuto` (nur die geänderten Felder, §3.6). Drei Regeln:
//
// 1. Getipptes wartet `DEBOUNCE_MS` nach dem letzten Tastendruck oder bis das
//    Feld verlassen wird; ein Klick (Chip, Häkchen, Auswahl) geht sofort (§3.2).
// 2. Eine Schlange je Maske: nie zwei Writes am selben Projekt zugleich. Was
//    während eines Requests getippt wird, geht im nächsten Durchlauf (§3.7).
// 3. Kein Endlos-Retry. Scheitert ein Speichern, steht «Nicht gespeichert» da,
//    bis die nächste Änderung oder «Erneut versuchen» es neu anstösst.

export const DEBOUNCE_MS = 1500

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ProjectAutosave {
  status: AutosaveStatus
  /** Zeitpunkt des letzten gelungenen Speicherns (für «Gespeichert ✓ 14:32»). */
  savedAt: Date | null
  error: string
  /** Läuft gerade etwas (Speichern, Team, Termin)? */
  busy: boolean
  /** Wurde in dieser Sitzung etwas gespeichert? Dann lädt die Übersicht beim Schliessen neu. */
  savedSomething: boolean
  /** Jetzt speichern (Feld verlassen, Enter, «Erneut versuchen», Verlassen der Maske). */
  flush: () => Promise<boolean>
  /**
   * Schreibvorgang (Team, Termin) in dieselbe Schlange stellen. Die Aufgabe
   * bekommt die Maske zum Zeitpunkt der AUSFÜHRUNG: aus dem Render des Klicks
   * gelesen, schickte «Team übernehmen» hinter einem laufenden Autosave den
   * alten Projektnamen mit — und setzte einen eben geänderten zurück.
   */
  run: (task: (form: UseProjectForm) => Promise<string>) => Promise<string>
}

export function useProjectAutosave(
  form: UseProjectForm,
  enabled: boolean,
  /** Nach jedem gelungenen PATCH: was rausging (für Kopfzeile und Übersicht). */
  onSaved: (payload: Record<string, unknown>) => void,
): ProjectAutosave {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [savedSomething, setSavedSomething] = useState(false)

  // Die Schlange liest die Maske zum Zeitpunkt der AUSFÜHRUNG, nicht des
  // Einreihens — sonst schickte ein wartender Durchlauf einen veralteten Stand.
  const formRef = useRef(form)
  const onSavedRef = useRef(onSaved)
  useLayoutEffect(() => {
    formRef.current = form
    onSavedRef.current = onSaved
  })

  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const queuedFlush = useRef<Promise<boolean> | null>(null)

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    setPending(n => n + 1)
    const p = chain.current.then(task, task).finally(() => setPending(n => n - 1))
    chain.current = p.catch(() => {})
    return p
  }

  // Letzter abgeschlossener Zustand — dahin kehrt die Anzeige zurück, wenn ein
  // Durchlauf nichts zu schicken hatte (z. B. nur die noch getippte Adresse).
  const settled = useRef<'idle' | 'saved'>('idle')

  async function save(): Promise<boolean> {
    // Einen Takt warten, damit React den letzten Stand gerendert hat und
    // `formRef` ihn kennt. Wichtig für den Durchlauf direkt hinter einem
    // anderen: dessen Ausgangsstand-Update muss gerendert sein, sonst gingen die
    // eben gespeicherten Felder ein zweites Mal raus.
    await new Promise(r => setTimeout(r, 0))
    setStatus('saving')
    const { payload, error: err } = await formRef.current.persistAuto()
    if (err) {
      setError(err)
      setStatus('error')
      return false
    }
    setError('')
    if (payload) {
      settled.current = 'saved'
      setSavedAt(new Date())
      setSavedSomething(true)
      onSavedRef.current(payload)
    }
    setStatus(settled.current)
    return true
  }

  function flush(): Promise<boolean> {
    if (!enabled) return Promise.resolve(true)
    // Wer verlässt oder Enter drückt, meint auch die getippte Adresse — der
    // Pausen-Timer (unten) dagegen nicht: er ruft `schedule`, nicht `flush`.
    formRef.current.releaseAddressHold()
    return schedule()
  }

  function schedule(): Promise<boolean> {
    // Ein schon eingereihter, noch nicht gestarteter Durchlauf liest ohnehin den
    // neuesten Stand — ein zweiter wäre ein leerer Request.
    if (queuedFlush.current) return queuedFlush.current
    const p = enqueue(async () => {
      queuedFlush.current = null
      return save()
    })
    queuedFlush.current = p
    return p
  }

  function run(task: (form: UseProjectForm) => Promise<string>): Promise<string> {
    return enqueue(async () => {
      // Wie in `save`: erst den Stand nach dem vorigen Durchlauf rendern lassen.
      await new Promise(r => setTimeout(r, 0))
      setStatus('saving')
      const err = await task(formRef.current)
      if (err) {
        setError(err)
        setStatus('error')
      } else {
        setError('')
        settled.current = 'saved'
        setSavedAt(new Date())
        setSavedSomething(true)
        setStatus('saved')
      }
      return err
    })
  }

  // Jede Änderung eines selbst speichernden Werts plant neu: ein Klick sofort,
  // Getipptes nach der Pause. Der Cleanup bricht den alten Timer ab — so zählt
  // die Pause ab dem LETZTEN Tastendruck.
  const signature = form.autosaveSignature
  const dirty = form.autosaveDirtyFields.length > 0
  useEffect(() => {
    if (!enabled || !dirty) return
    const delay = formRef.current.takeImmediate() ? 0 : DEBOUNCE_MS
    const t = setTimeout(() => { void schedule() }, delay)
    return () => clearTimeout(t)
    // `schedule` liest alles über Refs; neu geplant wird nur bei neuem Stand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, dirty])

  return {
    status, savedAt, error,
    busy: pending > 0,
    savedSomething,
    flush, run,
  }
}
