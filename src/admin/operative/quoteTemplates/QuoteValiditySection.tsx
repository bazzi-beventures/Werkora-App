// Gültigkeitsdauer der Offerte: EIN Wert, drei Wirkungen — das "Gültig bis" auf dem
// PDF, die Laufzeit des Annehmen-/Ablehnen-Links in der Offerten-Mail und die Frist im
// Standard-Bemerkungstext. Getrennte Knöpfe dafür wären der sichere Weg in den
// Widerspruch (PDF sagt 2 Monate, Link stirbt nach 30 Tagen — genau der Zustand bis
// 20260902). Wert und PATCH liegen im Panel, hier steht nur die Maske.
interface Props {
  // Eingabefeld-Wert als String (leer = Feld geleert), Zahl erst beim Speichern.
  months: string
  // Zuletzt gespeicherter Stand: steuert Speichern-/Zurücksetzen-Knopf und Hinweis.
  saved: string
  isDefault: boolean
  systemDefault: number
  min: number
  max: number
  saving: boolean
  error: string
  onChange: (v: string) => void
  // reset = zurück auf den System-Default (Spalte NULL)
  onSave: (reset: boolean) => void
}

export function QuoteValiditySection({
  months, saved, isDefault, systemDefault, min, max, saving, error, onChange, onSave,
}: Props) {
  const parsed = parseInt(months, 10)
  const invalid = months.trim() === '' || isNaN(parsed) || parsed < min || parsed > max
  return (
    <>
      <div className="admin-page-header" style={{ marginTop: 24 }}>
        <div>
          <div className="admin-page-title" style={{ fontSize: 18 }}>Gültigkeitsdauer</div>
          <div className="admin-page-subtitle">
            Wie lange eine Offerte ab Ausstellungsdatum gilt. Der Wert steht als
            «Gültig bis» auf dem PDF, bestimmt die Laufzeit der Annehmen-/Ablehnen-Links
            in der Offerten-Mail und die Frist im Standard-Bemerkungstext. Wirkt auf neue
            Offerten — bereits erstellte behalten ihr Datum, bereits verschickte Links
            ihre Laufzeit.
            {isDefault && ` Aktuell der Standard: ${systemDefault} Monate.`}
          </div>
        </div>
      </div>
      <div className="admin-table-wrap" style={{ padding: 16 }}>
        {error && <div className="admin-form-error" style={{ marginBottom: 8 }}>{error}</div>}
        <div style={{ flex: '1 1 160px', maxWidth: 220 }}>
          <label className="admin-form-label" htmlFor="quote-validity-months">Gültig (Monate)</label>
          <input
            id="quote-validity-months"
            className="admin-form-input"
            type="number"
            step="1"
            min={min}
            max={max}
            value={months}
            onChange={e => onChange(e.target.value)}
            placeholder={String(systemDefault)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => onSave(false)}
            disabled={saving || invalid || months === saved}
          >
            {saving ? 'Speichern…' : 'Dauer speichern'}
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => onSave(true)}
            disabled={saving || isDefault}
          >
            Auf Standard zurücksetzen
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Erlaubt sind {min} bis {max} Monate.
          </span>
        </div>
      </div>
    </>
  )
}
