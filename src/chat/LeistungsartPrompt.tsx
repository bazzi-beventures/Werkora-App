import { useState } from 'react'

// Kanonische Leistungsarten — Werte = CHECK-Constraint von reports.art_der_arbeit
// (Migration 20260809) und Spiegel von db.projects.WORK_TYPES; Labels wie auf dem
// gedruckten Rapportblatt und im Admin-Formular (ReportCreateForm.WORK_TYPES).
export const WORK_TYPES: { value: string; label: string }[] = [
  { value: 'Neumontage', label: 'Neumontage' },
  { value: 'Wiedermontage', label: 'Wiedermontage' },
  { value: 'Umbau', label: 'Umbau/Ersatz' },
  { value: 'Reparatur', label: 'Reparatur' },
  { value: 'Wartung', label: 'Service/Wartung' },
  { value: 'Demontage', label: 'Demontage' },
]

interface Props {
  // Aktueller Stand (pending_summary.art_der_arbeit bzw. die zuletzt getroffene
  // Auswahl). Nicht-kanonische Alt-Werte hat das Backend bereits aussortiert.
  initial: string[]
  onSubmit: (workTypes: string[]) => void
}

// Mitarbeiter kreuzt an, was er gemacht hat — dieselbe Leiste wie oben auf dem
// gedruckten Rapportblatt. Sammelt nur die Auswahl; geschrieben wird sie zusammen
// mit dem Rapport beim Bestätigen (reports.art_der_arbeit).
//
// Der Schritt erscheint nur, wenn das Projekt (Offerte/Auftrag) keine Leistungsart
// mitbringt — sonst steht sie in der Zusammenfassung und wird von dort über «Ändern»
// hierher aufgerufen. «Weiter» ohne Auswahl ist erlaubt: nicht jeder Einsatz passt
// in eine der sechs Arten.
export default function LeistungsartPrompt({ initial, onSubmit }: Props) {
  const [selected, setSelected] = useState<string[]>(
    () => WORK_TYPES.map(w => w.value).filter(v => initial.includes(v))
  )

  function toggle(value: string) {
    setSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }

  return (
    <div className="kleinmaterial-prompt">
      <div className="kleinmaterial-title">Was wurde gemacht?</div>
      <div className="kleinmaterial-sub">
        Leistungsart des Einsatzes — Mehrfachauswahl möglich.
      </div>

      {/* Eigenes Raster statt der kleinmaterial-Chips: die sechs Labels sind
          unterschiedlich lang, mit `flex: 1` wird jede Zeile anders breit und der
          letzte Knopf über die volle Breite gezogen. Zwei gleich breite Spalten
          bleiben auf jedem Handy lesbar. */}
      <div className="leistungsart-grid">
        {WORK_TYPES.map(w => (
          <button
            key={w.value}
            type="button"
            aria-pressed={selected.includes(w.value)}
            className={`leistungsart-chip ${selected.includes(w.value) ? 'is-selected' : ''}`}
            onClick={() => toggle(w.value)}
          >
            <span className="leistungsart-chip-check" aria-hidden="true">
              {selected.includes(w.value) ? '✓' : ''}
            </span>
            {w.label}
          </button>
        ))}
      </div>

      <div className="kleinmaterial-actions">
        <button
          type="button"
          className="confirm-btn confirm-btn-yes"
          onClick={() => onSubmit(selected)}
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
