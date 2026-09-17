import { useCallback, useEffect, useState } from 'react'
import { listProjectHistory } from '../../../api/admin/projects'
import type { ProjectHistory } from '../../../api/admin/projects'

// Der Projekt-Verlauf (Spec docs/specs/projekt-verlauf.md).
//
// Geladen wird **erst beim Öffnen des Reiters «Status»**, nicht mit dem Projekt:
// hinter dem Aufruf stehen rund zehn Abfragen (sieben Fachtabellen, das
// Änderungsprotokoll, die Namen), und wer den Reiter nur aufmacht, um ein
// Projekt abzuschliessen, soll sie nicht bezahlen. `enabled` ist deshalb kein
// Schönheitsschalter, sondern die halbe Begründung dafür, dass der Verlauf
// überhaupt dort sitzt.
//
// Kein Cache über den Tab-Wechsel hinaus: ein Verlauf, der eine Minute
// hinterherhinkt, beantwortet «wer hat das gerade gemacht?» falsch.

export interface UseProjectHistory {
  history: ProjectHistory | null
  loading: boolean
  /** Gescheitert — die Liste zeigt einen Hinweis statt eines leeren Verlaufs. */
  failed: boolean
  reload: () => Promise<void>
}

export function useProjectHistory(
  projectId: string | null | undefined,
  enabled: boolean,
): UseProjectHistory {
  const [history, setHistory] = useState<ProjectHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setFailed(false)
    try {
      setHistory(await listProjectHistory(projectId))
    } catch {
      // Ein leerer Verlauf und ein nicht geladener Verlauf sehen gleich aus —
      // deshalb wird der Unterschied hier festgehalten und angezeigt.
      setFailed(true)
      setHistory(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (enabled && projectId) void reload()
  }, [enabled, projectId, reload])

  return { history, loading, failed, reload }
}
