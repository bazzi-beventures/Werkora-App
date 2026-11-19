import { useState } from 'react'
import type { StaffLite } from './scheduleShared'
import { staffGroup, staffPillLabel, type StaffGroup } from './staffFilterGroups'
import './staffFilterPills.css'

// Sichtbarkeits-Filter der Einsatzplanung: Pillen je Mitarbeiter, getrennt in
// «Monteure» und «Admin» (Projektleitung, Admin, Management). Vorher stand das
// ganze Büro unter «Monteure» — wer nur die Leute auf dem Feld sehen wollte,
// musste die Büro-Pillen einzeln suchen. Die Admin-Gruppe hat eigene Farben für
// an/aus, damit man sie auch beim Durchklicken nicht verwechselt.
//
// Beschriftung wahlweise Kürzel («LB») oder Vorname plus Initial («Luca B.»),
// pro Browser gemerkt — wie Zoom und Wochenende reine Anzeige-Vorliebe.

const NAME_LABEL_KEY = 'schedule-staff-pill-names'

function readNameLabel(): boolean {
  try {
    return window.localStorage.getItem(NAME_LABEL_KEY) === '1'
  } catch {
    return false
  }
}

const GROUPS: { key: StaffGroup; label: string }[] = [
  { key: 'monteur', label: 'Monteure' },
  { key: 'admin', label: 'Admin' },
]

interface Props {
  staff: StaffLite[]
  hiddenStaff: Set<string>
  onHiddenChange: (next: Set<string>) => void
}

export default function StaffFilterPills({ staff, hiddenStaff, onHiddenChange }: Props) {
  const [showNames, setShowNames] = useState(readNameLabel)

  function toggleNames(on: boolean) {
    setShowNames(on)
    // Private-Mode / voller Storage darf die Auswahl nicht blockieren.
    try { window.localStorage.setItem(NAME_LABEL_KEY, on ? '1' : '0') } catch { /* egal */ }
  }

  function toggle(id: string) {
    const next = new Set(hiddenStaff)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onHiddenChange(next)
  }

  function setGroupHidden(ids: string[], hide: boolean) {
    const next = new Set(hiddenStaff)
    for (const id of ids) {
      if (hide) next.add(id)
      else next.delete(id)
    }
    onHiddenChange(next)
  }

  const allHidden = hiddenStaff.size === staff.length
  const groups = GROUPS
    .map(g => ({ ...g, members: staff.filter(s => staffGroup(s) === g.key) }))
    .filter(g => g.members.length > 0)

  return (
    <div className="project-cal-filter">
      <div className="project-cal-filter-head">
        <span>
          <span className="project-cal-filter-label">Mitarbeiter</span>
          <span className="project-cal-filter-count">
            {staff.length - hiddenStaff.size} von {staff.length} sichtbar
          </span>
        </span>
        <span className="staff-filter-actions">
          <label className="staff-filter-names">
            <input
              type="checkbox"
              checked={showNames}
              onChange={e => toggleNames(e.target.checked)}
            />
            Namen statt Kürzel
          </label>
          <button
            type="button"
            className="project-schedule-mini-btn"
            onClick={() => onHiddenChange(allHidden ? new Set() : new Set(staff.map(s => s.id)))}
          >
            {allHidden ? 'Alle anzeigen' : 'Alle ausblenden'}
          </button>
        </span>
      </div>
      {groups.map(g => {
        const ids = g.members.map(s => s.id)
        const hiddenCount = ids.filter(id => hiddenStaff.has(id)).length
        const groupHidden = hiddenCount === ids.length
        return (
          <div key={g.key} className={`staff-filter-group staff-filter-group--${g.key}`}>
            <div className="staff-filter-group-head">
              <span className="staff-filter-group-label">{g.label}</span>
              <span className="project-cal-filter-count">
                {ids.length - hiddenCount} von {ids.length}
              </span>
              <button
                type="button"
                className="project-schedule-mini-btn"
                onClick={() => setGroupHidden(ids, !groupHidden)}
              >
                {groupHidden ? `${g.label} anzeigen` : `${g.label} ausblenden`}
              </button>
            </div>
            <div className="absence-cal-staff-filter">
              {g.members.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`absence-cal-staff-chip${g.key === 'admin' ? ' staff-chip-admin' : ''}${hiddenStaff.has(s.id) ? ' hidden' : ''}`}
                  onClick={() => toggle(s.id)}
                  // Kürzel wie auf den Kacheln (§4) oder «Vorname N.»; der volle
                  // Name bleibt Tooltip und zugänglicher Name des Knopfs.
                  title={s.name}
                  aria-label={s.name}
                  aria-pressed={!hiddenStaff.has(s.id)}
                >
                  {staffPillLabel(s, showNames)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
