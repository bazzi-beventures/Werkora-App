import { useState } from 'react'
import type { StaffLite } from './scheduleShared'
import { STAFF_GROUPS, readNameLabel, staffGroup, staffPillLabel, writeNameLabel } from './staffFilterGroups'
import './staffFilterPills.css'
import './staffSwitcherPills.css'

// Mitarbeiter-Wahl der Mitarbeiter-Ansicht (WW-113): eine Pille je Mitarbeiter,
// gruppiert wie der Filter im Tagesplan (StaffFilterPills.tsx). Vorher stand hier
// ein Dropdown — jeder Wechsel kostete zwei Klicks (aufklappen, wählen), jetzt
// einen. ← / → blättern weiter der Reihe nach (nebeneinander, damit → beim
// Durchklicken nicht mit der Namenslänge wandert); der volle Name des gezeigten
// Mitarbeiters steht im Kopf, damit auch mit Kürzeln klar ist, wessen Woche
// das ist.

interface Props {
  staff: StaffLite[]
  focusedId: string | null
  position: number
  onPick: (id: string) => void
  onStep: (delta: number) => void
}

export default function StaffSwitcherPills({ staff, focusedId, position, onPick, onStep }: Props) {
  const [showNames, setShowNames] = useState(readNameLabel)
  const focused = staff.find(s => s.id === focusedId) ?? null
  const groups = STAFF_GROUPS
    .map(g => ({ ...g, members: staff.filter(s => staffGroup(s) === g.key) }))
    .filter(g => g.members.length > 0)

  return (
    <div className="project-cal-filter staff-switch">
      <div className="project-cal-filter-head">
        <span className="staff-switch-current">
          <span className="project-cal-filter-label">Mitarbeiter</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => onStep(-1)}
            title="Vorheriger Mitarbeiter"
            aria-label="Vorheriger Mitarbeiter"
          >←</button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => onStep(1)}
            title="Nächster Mitarbeiter"
            aria-label="Nächster Mitarbeiter"
          >→</button>
          <span className="staff-switch-name">{focused?.name ?? '—'}</span>
          <span className="project-cal-filter-count">{position} / {staff.length}</span>
        </span>
        <label className="staff-filter-names">
          <input
            type="checkbox"
            checked={showNames}
            onChange={e => { setShowNames(e.target.checked); writeNameLabel(e.target.checked) }}
          />
          Namen statt Kürzel
        </label>
      </div>
      {groups.map(g => (
        <div key={g.key} className={`staff-filter-group staff-filter-group--${g.key}`}>
          <span className="staff-filter-group-label">{g.label}</span>
          <div className="absence-cal-staff-filter">
            {g.members.map(s => {
              const active = s.id === focusedId
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`absence-cal-staff-chip staff-switch-chip${g.key === 'admin' ? ' staff-chip-admin' : ''}${active ? ' active' : ''}`}
                  onClick={() => onPick(s.id)}
                  title={s.name}
                  aria-label={s.name}
                  aria-pressed={active}
                >
                  {staffPillLabel(s, showNames)}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
