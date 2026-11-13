// Dialog hinter der Kachel «Projekte überfällig» — Projekt schliessen oder den
// Termin verschieben, einzeln oder als Auswahl. Aus DashboardScreen.tsx
// herausgezogen (Datei-Budget), Spec docs/specs/kachel-projekte-ueberfaellig.md.
import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { OverdueProject, getOverdueProjects, updateProjectSchedule, closeProject } from '../../api/admin'
import { daysSince, fmtDate, istPlausiblesDatum, todayISO } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'
import { DateTimeInput } from '../components/DateTimeInput'

export interface OverdueProjectsModalProps {
  onClose: () => void
  onChanged: () => void
  /** Die frisch geladene Anzahl — die Kachel übernimmt sie. Sonst zeigte sie den
   *  Stand vom letzten Dashboard-Laden (am Handy oft Stunden alt), der Dialog
   *  dahinter den von jetzt: 492 auf der Kachel, «Alle (484)» im Dialog (Spec
   *  kachel-projekte-ueberfaellig.md §2.2). */
  onCount?: (n: number) => void
  /** Projekt öffnen — für Projekte mit mehreren Terminen, die hier nicht
   *  verschoben werden (Spec §3.4). */
  onOpenProject?: (projectId: string) => void
}

interface RowDraft {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
}

function rowFromProject(p: OverdueProject): RowDraft {
  return {
    startDate: p.start_date?.slice(0, 10) ?? '',
    endDate: p.end_date?.slice(0, 10) ?? '',
    startTime: p.start_time?.slice(0, 5) ?? '',
    endTime: p.end_time?.slice(0, 5) ?? '',
  }
}

/** Das effektive Ende eines Termins: Enddatum, sonst Startdatum. `end_date` ist am
 *  Termin optional — ein eintägiger Termin trägt nur ein Startdatum, und die Zeile
 *  stünde sonst mit "Geplant bis —" da (Pendant zu
 *  db/project_appointments.py::effective_appointment_end). */
function effectiveEnd(p: OverdueProject): string | null {
  return p.end_date ?? p.start_date ?? null
}

const LABEL_STYLE = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' } as const

/** Ab wie vielen ausgewählten Projekten das Sammel-Schliessen rückfragt. */
const BULK_CLOSE_CONFIRM_FROM = 50

export function OverdueProjectsModal({ onClose, onChanged, onCount, onOpenProject }: OverdueProjectsModalProps) {
  const [projects, setProjects] = useState<OverdueProject[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [busy, setBusy] = useState<{ id: string; type: 'save' | 'close' } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkClosing, setBulkClosing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const { toast, showToast } = useToast(3000)

  // Einmal beim Öffnen. `onCount` bewusst nicht in den Abhängigkeiten: der
  // Elternteil reicht eine neue Funktion je Render, und ein zweites Laden würde
  // nur denselben Stand noch einmal holen.
  useEffect(() => {
    getOverdueProjects()
      .then(list => {
        setProjects(list)
        const init: Record<string, RowDraft> = {}
        list.forEach(p => { init[p.id] = rowFromProject(p) })
        setDrafts(init)
        // Die Kachel zählt nur «überfällig», nicht die abschlussreifen (§3.3).
        onCount?.(list.filter(p => p.gruppe !== 'abschlussreif').length)
      })
      // Ein Lesefehler ist kein «Keine überfälligen Projekte» — das hiesse
      // «alles erledigt», obwohl niemand weiss, wie es steht.
      .catch(() => setLoadError(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patchDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => (
      projects && prev.size < projects.length ? new Set(projects.map(p => p.id)) : new Set()
    ))
  }

  async function handleSave(p: OverdueProject) {
    const d = drafts[p.id]
    if (!d) return
    if (d.startDate && d.endDate && d.endDate < d.startDate) {
      showToast('Enddatum muss ≥ Startdatum sein', 'error')
      return
    }
    setBusy({ id: p.id, type: 'save' })
    try {
      await updateProjectSchedule(
        p.id,
        d.startDate || null,
        d.endDate || null,
        d.startTime || null,
        d.endTime || null,
      )
      // todayISO() statt toISOString(): letzteres rechnet nach UTC um und liefert in
      // der Schweiz nachts noch das Datum von gestern — die Zeile bliebe dann stehen,
      // obwohl der Termin repariert ist. Verglichen wird das effektive Ende, damit ein
      // eintägiger Termin (nur Startdatum) genauso zählt.
      const today = todayISO()
      const newEnd = d.endDate || d.startDate
      if (newEnd && newEnd >= today) {
        setProjects(list => list ? list.filter(x => x.id !== p.id) : list)
        showToast('Termin aktualisiert', 'success')
        onChanged()
      } else {
        showToast('Gespeichert', 'success')
      }
    } catch {
      showToast('Fehler beim Speichern', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleClose(p: OverdueProject) {
    if (!window.confirm(`Projekt "${p.name}" als abgeschlossen markieren?`)) return
    setBusy({ id: p.id, type: 'close' })
    try {
      await closeProject(p.id)
      setProjects(list => list ? list.filter(x => x.id !== p.id) : list)
      setSelected(prev => {
        if (!prev.has(p.id)) return prev
        const next = new Set(prev)
        next.delete(p.id)
        return next
      })
      showToast('Projekt geschlossen', 'success')
      onChanged()
    } catch {
      showToast('Fehler beim Schliessen', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Sammel-Schliessen für den Altbestand: nie geschlossene Projekte von vor Jahren
  // (beim Pilotkunden dreistellig) sind einzeln nicht abzuarbeiten, und solange sie
  // in der Kachel stehen, ist die Zahl als Signal wertlos. Sequentiell über den
  // bestehenden Endpoint — kein Auto-Schliessen durch das System: die Auswahl bleibt
  // eine bewusste Handlung des Admins (Spec §4.6/§6.2).
  async function handleCloseSelected() {
    if (!projects || selected.size === 0) return
    const ids = projects.filter(p => selected.has(p.id)).map(p => p.id)
    if (ids.length >= BULK_CLOSE_CONFIRM_FROM
      && !window.confirm(`${ids.length} Projekte als abgeschlossen markieren?`)) return

    setBulkClosing(true)
    const failed: string[] = []
    for (const id of ids) {
      try {
        await closeProject(id)
      } catch {
        failed.push(id)
      }
    }
    const closed = new Set(ids.filter(id => !failed.includes(id)))
    setProjects(list => list ? list.filter(p => !closed.has(p.id)) : list)
    setSelected(new Set(failed))
    setBulkClosing(false)
    if (failed.length === 0) {
      showToast(`${closed.size} Projekte geschlossen`, 'success')
    } else {
      showToast(`${closed.size} geschlossen, ${failed.length} fehlgeschlagen`, 'error')
    }
    if (closed.size > 0) onChanged()
  }

  const isBusy = (id: string, type: 'save' | 'close') =>
    busy?.id === id && busy?.type === type

  // Ein Projekt mit mehreren Terminen wird hier nicht verschoben: die vier Felder
  // sind die Spiegel-Spalten des ERSTtermins, und den zu verschieben ist bei
  // «Ausmass erledigt, Montage war im Oktober» der falsche (Spec §3.4).
  // Abschlussreife Projekte brauchen keinen Termin mehr, nur den Abschluss.
  function renderRow(p: OverdueProject) {
    const d = drafts[p.id]
    if (!d) return null
    const ende = p.last_end ?? effectiveEnd(p)
    const abschlussreif = p.gruppe === 'abschlussreif'
    const mehrereTermine = (p.termin_count ?? 1) > 1
    return (
      <div key={p.id} className="admin-list-item" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            style={{ marginTop: 4 }}
            checked={selected.has(p.id)}
            onChange={() => toggleSelected(p.id)}
            disabled={bulkClosing}
            aria-label={`${p.name} auswählen`}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.customer_name ?? '—'}</div>
            <div style={{ fontSize: 12, color: abschlussreif ? 'var(--text-muted)' : 'var(--danger)', marginTop: 2 }}>
              {istPlausiblesDatum(ende)
                ? <>Letzter Termin {fmtDate(ende)} ({daysSince(ende)} Tage{abschlussreif ? '' : ' überfällig'}){mehrereTermine ? ` · ${p.termin_count} Termine` : ''}</>
                // Jahr 0206 statt 2026: keine «664807 Tage», sondern ein Auftrag.
                : <>Datum prüfen: {ende?.slice(8, 10)}.{ende?.slice(5, 7)}.{ende?.slice(0, 4)}</>}
            </div>
          </div>
        </div>
        {!abschlussreif && !mehrereTermine && (
          <div className="admin-form-row">
            <label style={LABEL_STYLE}>
              <span>Start</span>
              <DateTimeInput type="date" className="admin-input" value={d.startDate}
                onValueChange={v => patchDraft(p.id, { startDate: v })} />
            </label>
            <label style={LABEL_STYLE}>
              <span>Ende</span>
              <DateTimeInput type="date" className="admin-input" value={d.endDate}
                onValueChange={v => patchDraft(p.id, { endDate: v })} />
            </label>
            <label style={LABEL_STYLE}>
              <span>Startzeit</span>
              <DateTimeInput type="time" className="admin-input" value={d.startTime}
                onValueChange={v => patchDraft(p.id, { startTime: v })} />
            </label>
            <label style={LABEL_STYLE}>
              <span>Endzeit</span>
              <DateTimeInput type="time" className="admin-input" value={d.endTime}
                onValueChange={v => patchDraft(p.id, { endTime: v })} />
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {!abschlussreif && !mehrereTermine && (
            <button
              className="admin-btn admin-btn-primary"
              style={{ flex: 1 }}
              disabled={busy !== null || bulkClosing}
              onClick={() => handleSave(p)}
            >
              {isBusy(p.id, 'save') ? 'Speichere…' : 'Speichern'}
            </button>
          )}
          {!abschlussreif && mehrereTermine && onOpenProject && (
            <button
              className="admin-btn admin-btn-primary"
              style={{ flex: 1 }}
              onClick={() => onOpenProject(p.id)}
            >
              Termine öffnen
            </button>
          )}
          <button
            className="admin-btn admin-btn-secondary"
            style={{ flex: 1 }}
            disabled={busy !== null || bulkClosing}
            onClick={() => handleClose(p)}
          >
            {isBusy(p.id, 'close') ? '…' : 'Projekt schliessen'}
          </button>
        </div>
      </div>
    )
  }

  const ueberfaellig = (projects ?? []).filter(p => p.gruppe !== 'abschlussreif')
  const abschlussreif = (projects ?? []).filter(p => p.gruppe === 'abschlussreif')

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Überfällige Projekte</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <ToastHost toast={toast} />
          {projects === null && !loadError && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
          {loadError && (
            <div className="admin-empty" role="alert">
              Die überfälligen Projekte konnten nicht geladen werden. Bitte später erneut öffnen.
            </div>
          )}
          {projects !== null && projects.length === 0 && <div className="admin-empty">Keine überfälligen Projekte</div>}
          {projects !== null && projects.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selected.size === projects.length}
                  ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < projects.length }}
                  onChange={toggleAll}
                  disabled={bulkClosing}
                />
                <span>Alle ({projects.length})</span>
              </label>
              <button
                className="admin-btn admin-btn-secondary"
                style={{ marginLeft: 'auto' }}
                disabled={selected.size === 0 || bulkClosing || busy !== null}
                onClick={handleCloseSelected}
              >
                {bulkClosing ? 'Schliesse…' : `Ausgewählte schliessen${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
            </div>
          )}
          {projects !== null && ueberfaellig.length > 0 && (
            <>
              <div className="admin-kpi-group-title" style={{ marginBottom: 8 }}>
                Überfällig ({ueberfaellig.length}) — Termin vorbei, weder Rapport noch Rechnung
              </div>
              <div className="admin-list">{ueberfaellig.map(renderRow)}</div>
            </>
          )}
          {projects !== null && abschlussreif.length > 0 && (
            <>
              <div className="admin-kpi-group-title" style={{ margin: '16px 0 8px' }}>
                Abschlussreif ({abschlussreif.length}) — Rapport oder Rechnung vorhanden, nie geschlossen
              </div>
              <div className="admin-list">{abschlussreif.map(renderRow)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
