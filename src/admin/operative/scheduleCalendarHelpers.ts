// Helfer der Kalender-Ansichten: Kachel-Label und «Doppelklick öffnet das Projekt».
// Seit Charge M4d (Spec refactoring-wachstum.md §17) eigene Datei; vorher Teil von
// ProjectScheduleCalendar.tsx. Unverändert verschoben.
import type { ScheduleProject } from '../../api/admin/projects'
import { entryTitle, fmtTime, type CalendarEntry } from './scheduleShared'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function pillLabel(p: ScheduleProject): string {
  const t = fmtTime(p.start_time)
  const name = entryTitle(p)
  return t ? `${t} ${name}` : name
}

// Doppelklick öffnet das Projekt. Der Einfachklick (Panel) feuert dabei zwangsläufig
// mit — er ist folgenlos, weil die Projektmaske den Screen ohnehin ersetzt. Die
// Textauswahl, die ein Doppelklick sonst auslöst, wird unterdrückt.
export function openBinding(p: CalendarEntry, onOpenProject?: (p: ScheduleProject) => void) {
  if (!onOpenProject) return {}
  return {
    onDoubleClick: (e: React.MouseEvent) => {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      onOpenProject(p)
    },
  }
}
