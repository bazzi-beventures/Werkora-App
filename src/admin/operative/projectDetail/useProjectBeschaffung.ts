import { useState } from 'react'
import { setProjectBeschaffung } from '../../../api/admin/projects'
import type { Project } from '../../../api/admin/projects'

// Beschaffungsstatus des Projekts (Feature `beschaffungsstatus`, Charge H, H3):
// der Arbeitsschritt der Materialbeschaffung — bestellt, geliefert, …
//
// Eigener Zustand statt direkt auf dem `project`-Prop, weil ihn ZWEI Wege
// aendern: das Dropdown im Reiter Lieferantendokumente und der Datei-Upload
// (das Backend rueckt beim Hochladen einer Auftragsbestaetigung selbst vor).
// Auf dem Prop wuerde beides erst nach dem Schliessen des Detailscreens
// sichtbar.

export interface UseProjectBeschaffung {
  status: string | null
  at: string | null
  /** 'auto' = vom Server beim Datei-Upload gesetzt, 'manual' = per Dropdown. */
  source: string | null
  saving: boolean
  /** Setzt den Schritt (null = kein Beschaffungsvorgang). */
  change: (next: string | null) => Promise<void>
  /** Der Server hat beim Upload selbst vorgerueckt — Anzeige nachziehen. */
  advancedByServer: (status: string) => void
}

export function useProjectBeschaffung(
  project: Project | null,
  onToast: (msg: string) => void,
): UseProjectBeschaffung {
  const [status, setStatus] = useState<string | null>(project?.workflow_status ?? null)
  const [at, setAt] = useState<string | null>(project?.workflow_status_at ?? null)
  const [source, setSource] = useState<string | null>(project?.workflow_status_source ?? null)
  const [saving, setSaving] = useState(false)

  function advancedByServer(next: string) {
    setStatus(next)
    setAt(new Date().toISOString())
    setSource('auto')
  }

  async function change(next: string | null) {
    if (!project) return
    const previous = { status, at, source }
    // Optimistisch setzen: das Dropdown soll nicht auf den Roundtrip warten.
    setStatus(next)
    setAt(new Date().toISOString())
    setSource('manual')
    setSaving(true)
    try {
      await setProjectBeschaffung(project.id, next)
    } catch (err) {
      // Zurueckdrehen statt stehenlassen — ein Dropdown, das einen nicht
      // gespeicherten Wert zeigt, ist schlimmer als eines, das die Aenderung
      // sichtbar verwirft.
      setStatus(previous.status)
      setAt(previous.at)
      setSource(previous.source)
      onToast(err instanceof Error ? err.message : 'Fehler beim Speichern des Beschaffungsstatus')
    } finally {
      setSaving(false)
    }
  }

  return { status, at, source, saving, change, advancedByServer }
}
