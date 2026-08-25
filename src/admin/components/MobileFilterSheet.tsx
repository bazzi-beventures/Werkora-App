import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackButton } from '../../shared/backButton'
import { FilterSections, clearedValues } from './ColumnFilter'
import type { FilterSection, FilterValues } from './ColumnFilter'

/**
 * Dieselben Filter-Abschnitte als Vollbild-Sheet.
 *
 * Auf dem Handy rendert der Screen Karten statt einer Tabelle — es gibt keinen
 * Spaltenkopf, an den ein Trichter passt. Deshalb ein Knopf "Filter" in der
 * Filterleiste, der alle Abschnitte untereinander zeigt.
 *
 * `useBackButton` ist Pflicht, nicht Kür: Overlays ohne Registrierung brechen den
 * Zurück-Stack der PWA — das Hardware-Zurück schlösse nicht das Sheet, sondern
 * spränge aus dem Screen heraus.
 *
 * Die Abschnitte kommen aus derselben Definition wie die Popups (`FilterSections`),
 * damit ein neuer Filter nicht auf dem Handy fehlen kann.
 */

interface Props {
  open: boolean
  sections: FilterSection[]
  values: FilterValues
  onApply: (next: FilterValues) => void
  onClose: () => void
}

export function MobileFilterSheet({ open, sections, values, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<FilterValues>(values)

  // Beim Öffnen den aktuellen Stand übernehmen: was man im Sheet ändert, gilt
  // erst mit "Übernehmen" — sonst filtert die Liste bei jedem Häkchen neu.
  useEffect(() => {
    if (open) setDraft({ ...clearedValues(sections), ...values })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useBackButton(open, onClose)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-label="Filter"
        style={{ width: '100%', maxWidth: '100vw' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="admin-modal-title">Filter</div>
          <button className="admin-modal-close" aria-label="Filter schliessen" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <FilterSections sections={sections} draft={draft} onDraft={setDraft} />
        </div>
        <div className="admin-modal-footer" style={{ position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => setDraft(clearedValues(sections))}
          >
            Zurücksetzen
          </button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => { onApply(draft); onClose() }}
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
