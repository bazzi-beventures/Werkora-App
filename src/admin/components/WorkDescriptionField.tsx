// «Ausgeführte Arbeiten» im Rechnung-Erstellen-Dialog — Häkchen plus Freitext
// (Feature-Anfrage WW-52). Geteilt von Projektdetail und Rechnungen-Screen; die
// Payload-Regel liegt in utils/workDescription.ts, hier nur die Darstellung.
//
// Vorher hatte nur der Rechnungen-Screen das Feld. Wer aus dem Projekt heraus
// abrechnete — der häufigere Weg —, bekam den Vorschlag aus den Rapporten
// ungefragt aufs PDF und konnte ihn weder weglassen noch umformulieren.

import { AutoGrowTextarea } from './AutoGrowTextarea'
import type { WorkDescriptionState } from '../utils/workDescription'

interface Props {
  value: WorkDescriptionState
  onChange: (next: WorkDescriptionState) => void
  disabled?: boolean
  idPrefix: string
}

export function WorkDescriptionField({ value, onChange, disabled, idPrefix }: Props) {
  const textId = `${idPrefix}-work-desc`
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={e => onChange({ ...value, enabled: e.target.checked })}
        />
        <span style={{ fontWeight: 600 }}>Ausgeführte Arbeiten auf der Rechnung</span>
      </label>
      {value.enabled ? (
        <div style={{ margin: '8px 0 0 24px' }}>
          <AutoGrowTextarea
            id={textId}
            aria-label="Ausgeführte Arbeiten"
            className="admin-form-input"
            minRows={4}
            maxLength={4000}
            value={value.text}
            placeholder={value.loading
              ? 'Wird geladen…'
              : value.failed
                ? 'Vorschlag nicht geladen — leer lassen übernimmt die Rapporte, oder eigenen Text schreiben.'
                : 'Eigenen Text schreiben. Leer lassen, um den Block wegzulassen.'}
            onChange={e => onChange({ ...value, text: e.target.value })}
            disabled={value.loading || disabled}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Vorschlag aus den Rapporten dieses Projekts — anpassen oder durch eigenen
            Text ersetzen, er steht so über den Positionen.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0 24px' }}>
          Die Rechnung erscheint ohne den Block «Ausgeführte Arbeiten».
        </div>
      )}
    </div>
  )
}
