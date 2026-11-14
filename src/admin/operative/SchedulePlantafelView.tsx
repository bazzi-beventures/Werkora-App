// Plantafel der Einsatzplanung (Monteure als Zeilen × Wochentage).
// Seit Charge M4d (Spec refactoring-wachstum.md §17) eigene Datei; vorher Teil von
// ProjectScheduleCalendar.tsx. Unverändert verschoben.
import { Fragment, useState } from 'react'
import type { ScheduleProject } from '../../api/admin/projects'
import type { ScheduleAbsence } from '../../api/admin/scheduling'
import { getWeekDays, toDateStr, isToday, diffDays } from '../utils/calendarHelpers'
import { absenceEntryLookup, isVacation, crewMembers, entryTitle, fmtTimeRange, hasUnassignedEntries, kindSymbol, neededDistancePairs, overlapConflictIds, pillBg, pillClass, pillExtraLines, projectMonteurNames, readDragPayload, reassignTeam, rowEntries, setDragPayload, useScheduleDistances, visibleWeekDays, type CalendarEntry, type StaffLite } from './scheduleShared'
import StaffNameCell from './StaffNameCell'
import { EinsatzStandPunkt } from './EinsatzStandPunkt'
import type { EinsatzStaende } from './useEinsatzStaende'
import { openBinding } from './scheduleCalendarHelpers'

// ─── Plantafel (Monteure als Zeilen × Wochentage) ───────────────────────────
// Dispositions-Sicht: eine Zeile pro Monteur, Spalten Mo–So. Ein Termin mit
// mehreren Monteuren erscheint in jeder betroffenen Zeile; Termine ohne
// (bekannten) Monteur sammeln sich in der Zeile «Ohne Monteur». Drag&Drop
// verschiebt den Tag; ein Drop in einer anderen Monteur-Zeile weist zusätzlich
// den Quell-Monteur auf den Ziel-Monteur um (restliches Team bleibt erhalten).

export function PlantafelView({
  projects, staff, rowStaff, fields, currentDate, onSelect, onOpenProject, onReschedule, onCreateCell, holidays,
  showDistances, absences, hideWeekend = false, onOpenStaff, einsatzStaende,
}: {
  einsatzStaende?: EinsatzStaende | null
  projects: CalendarEntry[]
  staff: StaffLite[]
  // Klick auf den Namen links: Mitarbeiter-Ansicht dieses Monteurs (WW-68).
  onOpenStaff?: (staffId: string) => void
  // Zeilen der Tafel = Monteure nach aktivem Filter (staff bleibt die volle
  // Liste für Namensauflösung in Tooltips/Zusatzfeldern).
  rowStaff: StaffLite[]
  fields?: Record<string, boolean>
  currentDate: Date
  onSelect: (p: ScheduleProject) => void
  onOpenProject?: (p: ScheduleProject) => void
  onReschedule: (id: string, deltaDays: number, startTime?: string | null, monteurIds?: string[]) => void
  // Klick auf leere Zelle → neuer Termin an diesem Tag mit dem Zeilen-Monteur
  // vorbelegt (null = Zeile «Ohne Monteur»).
  onCreateCell?: (dayISO: string, monteurId: string | null) => void
  holidays: Map<string, string>
  // Fahrdistanzen zwischen aufeinanderfolgenden Einsätzen anzeigen (Tenant-Config).
  showDistances?: boolean
  // Genehmigte Absenzen im geladenen Fenster (leer = Modul aus oder nichts los).
  absences?: ScheduleAbsence[]
  // Sa/So ausblenden (WW-56).
  hideWeekend?: boolean
}) {
  const days = visibleWeekDays(getWeekDays(currentDate), hideWeekend)
  // Hover-Zelle beim Drag: `${dayISO}|${rowId}` (rowId '' = «Ohne Monteur»).
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  const projById = new Map(projects.map(p => [p.id, p]))
  const staffIds = new Set(staff.map(s => s.id))

  // Einträge einer Zelle: rowId = Monteur-Zeile, null = «Ohne Monteur».
  // Ganztägige zuerst, danach chronologisch. Geteilt mit der Gantt-Ansicht.
  function cellEntries(rowId: string | null, day: Date): CalendarEntry[] {
    return rowEntries(projects, staffIds, rowId, day)
  }

  const hasUnassigned = hasUnassignedEntries(projects, staffIds, days)

  const distBetween = useScheduleDistances(
    showDistances ? neededDistancePairs(projects, staffIds, rowStaff, days) : [],
  )

  const absentOn = absenceEntryLookup(absences ?? [])


  function handleDrop(e: React.DragEvent, day: Date, rowId: string | null) {
    e.preventDefault()
    setHoverCell(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const proj = projById.get(payload.projectId)
    if (!proj) return
    const delta = diffDays(payload.grabDayISO, toDateStr(day))
    // Zeilenwechsel = Umzuweisung (geteilt mit dem Gantt, siehe reassignTeam):
    // Quell-Monteur raus, Ziel-Monteur rein. Drop in «Ohne Monteur» ändert das
    // Team nicht — dann bleibt nur der Tagesversatz.
    const newTeam = reassignTeam(proj.monteur_ids, rowId, payload.sourceRowId || null)
    if (delta !== 0 || newTeam) onReschedule(proj.id, delta, undefined, newTeam)
  }

  function renderChip(p: CalendarEntry, dayISO: string, rowId: string | null, conflict: boolean) {
    const timeLabel = fmtTimeRange(p)
    const extra = pillExtraLines(p, staff, fields)
    const monteurs = projectMonteurNames(p, staff)
    const symbol = kindSymbol(p)
    // In der Plantafel steht jeder Monteur in seiner eigenen Zeile — der Lead
    // bekommt deshalb keine eigene Pille, sondern seine Kachel eine rote Kante.
    const isLead = !!rowId && crewMembers(p, staff)[0]?.id === rowId
    return (
      <div
        key={p.id}
        className={`project-cal-board-chip${conflict ? ' conflict' : ''}${isLead ? ' lead' : ''}${pillClass(p)}`}
        draggable
        onDragStart={e => setDragPayload(e, p.id, dayISO, rowId ?? '')}
        onClick={() => onSelect(p)}
        {...openBinding(p, onOpenProject)}
        style={{ background: pillBg(p) }}
        title={[
          entryTitle(p), timeLabel, monteurs, ...extra,
          isLead ? 'Lead-Monteur' : '',
          conflict ? '⚠ Zeitliche Überschneidung mit einem anderen Einsatz dieses Monteurs' : '',
        ].filter(Boolean).join(' · ')}
      >
        <span className="project-cal-board-chip-time">
          {einsatzStaende?.date === dayISO && <EinsatzStandPunkt stand={einsatzStaende.meldungen[p.id]} />}
          {symbol && <span className="project-cal-kind-symbol">{symbol}</span>}
          {timeLabel || 'ganztägig'}
          {conflict && <span className="project-cal-board-chip-warn">⚠</span>}
        </span>
        <span className="project-cal-board-chip-name">
          {p.termin_badge && <span className="project-cal-termin-badge">{p.termin_badge}</span>}
          {entryTitle(p)}
        </span>
      </div>
    )
  }

  // `zebra`: jede zweite Monteur-Zeile hellblau hinterlegt (WW-57) — bei einem
  // Einsatz am rechten Rand verrutscht man sonst leicht in die Nachbarzeile.
  function renderRow(rowId: string | null, label: string, zebra = false) {
    return (
      <div key={rowId ?? '∅'} className={`project-cal-board-row${zebra ? ' zebra' : ''}`}>
        <div className={`project-cal-board-staff${rowId === null ? ' unassigned' : ''}`}>
          <StaffNameCell rowId={rowId} label={label} onOpenStaff={onOpenStaff} />
        </div>
        {days.map(d => {
          const dayISO = toDateStr(d)
          const cellKey = `${dayISO}|${rowId ?? ''}`
          const entries = cellEntries(rowId, d)
          const conflicts = rowId !== null ? overlapConflictIds(entries) : new Set<string>()
          // «Ohne Monteur» ist niemand — dort gibt es auch keine Abwesenheit.
          const absenceEntry = rowId !== null ? absentOn(rowId, dayISO) : null
          const absence = absenceEntry?.label ?? null
          return (
            <div
              key={dayISO}
              className={
                `project-cal-board-cell${isToday(d) ? ' today' : ''}` +
                `${holidays.has(dayISO) ? ' holiday' : ''}` +
                `${absence ? ' absent' : ''}${isVacation(absenceEntry) ? ' vacation' : ''}` +
                `${hoverCell === cellKey ? ' project-cal-drop-hover' : ''}` +
                `${onCreateCell ? ' creatable' : ''}`
              }
              onDragOver={e => { e.preventDefault(); setHoverCell(cellKey) }}
              onDragLeave={() => setHoverCell(prev => prev === cellKey ? null : prev)}
              onDrop={e => handleDrop(e, d, rowId)}
              onClick={e => {
                // Nur Klicks auf die freie Zellfläche — Chips öffnen ihr Panel selbst.
                if (onCreateCell && e.target === e.currentTarget) onCreateCell(dayISO, rowId)
              }}
              title={absence ?? (onCreateCell ? 'Klicken, um hier einen Einsatz zu planen' : undefined)}
            >
              {absence && <div className="project-cal-board-absence">{absence}</div>}
              {entries.map((p, i) => {
                const next = entries[i + 1]
                const km = showDistances && rowId !== null && next ? distBetween(p, next) : null
                return (
                  <Fragment key={p.id}>
                    {renderChip(p, dayISO, rowId, conflicts.has(p.id))}
                    {km !== null && (
                      <div
                        className="project-cal-board-dist"
                        title={`Fahrstrecke ${p.object_address} → ${next.object_address}`}
                      >
                        ↓ {km.toLocaleString('de-CH', { maximumFractionDigits: 1 })} km
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="project-cal-board" style={{ '--cal-days': days.length } as React.CSSProperties}>
      <div className="project-cal-board-row project-cal-board-header">
        <div className="project-cal-board-staff">Monteur</div>
        {days.map(d => {
          const holidayName = holidays.get(toDateStr(d))
          return (
            <div key={toDateStr(d)} className={`project-cal-board-day-head${isToday(d) ? ' today' : ''}`}>
              <span className="project-cal-week-day-wd">{d.toLocaleDateString('de-CH', { weekday: 'short' })}</span>{' '}
              <span className="project-cal-week-day-num">{d.getDate()}.{d.getMonth() + 1}.</span>
              {holidayName && <div className="project-cal-week-day-holiday">{holidayName}</div>}
            </div>
          )
        })}
      </div>
      {rowStaff.map((s, i) => renderRow(s.id, s.name, i % 2 === 1))}
      {hasUnassigned && renderRow(null, 'Ohne Monteur')}
      {rowStaff.length === 0 && !hasUnassigned && (
        <div className="admin-empty">Keine Monteure sichtbar.</div>
      )}
    </div>
  )
}
