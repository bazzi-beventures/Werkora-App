// Kleine Bausteine der Kalender-Ansichten: Legende und Absenz-Chips.
// Seit Charge M4d (Spec refactoring-wachstum.md §17) eigene Datei; vorher Teil von
// ProjectScheduleCalendar.tsx. Unverändert verschoben.
import { absenceKind, staffShortLabel, type DayAbsence, terminLegend } from './scheduleShared'

// ─── Legend ───────────────────────────────────────────────────────────────────

export function CalendarLegend({ canton }: { canton: string }) {
  return (
    <div className="absence-cal-legend">
      <div className="absence-cal-legend-item">
        <span className="absence-cal-legend-dot absence-cal-legend-dot--holiday" />
        Feiertag {canton.toUpperCase()}
      </div>
      <div className="absence-cal-legend-item" style={{ color: 'var(--muted)' }}>
        {terminLegend()} · 👥 Teamsitzung · 📦 Lager · ⚙️ Werkstatt · 🚧 Blocker (schraffiert = provisorisch)
      </div>
      <div className="absence-cal-legend-item" style={{ color: 'var(--muted)' }}>
        Tipp: Einsatz greifen und auf einen anderen Tag ziehen — in der Wochenansicht auch auf eine andere Uhrzeit. Auf freier Fläche einen Zeitraum aufziehen, um einen neuen Termin zu planen. Mit der Maus auf einem Einsatz stehen bleiben zeigt alle Angaben, <strong>Doppelklick</strong> öffnet das Projekt.
      </div>
    </div>
  )
}

// ─── Abwesenheiten ausserhalb der Plantafel ───────────────────────────────────
// Genehmigte Absenzen (Ferien, Militär, …) als schraffierte Chips je Tag
// (einsatzplanung-rueckmeldungen-2026-10.md §7). Vorher sah man sie nur in der
// Plantafel; wer in Woche oder Mitarbeiter-Ansicht plante, erfuhr erst beim
// Speichern (409) davon. Abgeleitet, kein Datensatz: zieht jemand seine Ferien
// zurück, verschwindet die Markierung mit dem nächsten Laden.
//
// `withName`: ausserhalb der Mitarbeiter-Ansicht Kürzel + Art («MW Ferien»), das
// volle Label und der Name im title. In der Mitarbeiter-Ansicht ist klar, um wen
// es geht — dort steht das volle Label («Ferien 24.08.–28.08.2026»).
export function AbsenceChips({ list, withName }: { list: DayAbsence[]; withName: boolean }) {
  if (list.length === 0) return null
  return (
    <div className="project-cal-absences">
      {list.map(a => (
        <span
          key={a.staff.id}
          className={`project-cal-absence-chip${a.vacation ? ' vacation' : ''}`}
          title={`${a.staff.name}: ${a.label}`}
        >
          {withName ? `${staffShortLabel(a.staff)} ${absenceKind(a.label)}` : a.label}
        </span>
      ))}
    </div>
  )
}
