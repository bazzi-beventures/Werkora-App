// Skonto-Vorgabe: belegt die beiden Skonto-Felder im Erstell-Formular vor. Leer =
// keine Vorgabe. Beide Werte als String (Eingabefeld), Zahl erst beim Speichern —
// deshalb liegen Zustand und PATCH im Panel, hier steht nur die Maske.
interface Props {
  pct: string
  days: string
  // Zuletzt gespeicherter Stand — steuert „Vorgabe entfernen" und den Hinweistext.
  saved: { pct: string; days: string }
  saving: boolean
  error: string
  onPctChange: (v: string) => void
  onDaysChange: (v: string) => void
  // clear = beide Werte löschen (Vorgabe entfernen)
  onSave: (clear: boolean) => void
}

export function SkontoDefaultsSection({
  pct, days, saved, saving, error, onPctChange, onDaysChange, onSave,
}: Props) {
  return (
    <>
      <div className="admin-page-header" style={{ marginTop: 24 }}>
        <div>
          <div className="admin-page-title" style={{ fontSize: 18 }}>Skonto-Vorgabe</div>
          <div className="admin-page-subtitle">
            Startwerte für die Skonto-Felder einer neuen Offerte — üblich ist ein fester
            Satz pro Firma («2% innert 10 Tagen»). Das Skonto-Häkchen der Offerte bleibt
            trotzdem aus: die Vorgabe füllt nur die Felder, angehakt wird pro Offerte.
            Beide Werte bleiben frei änderbar; bestehende Offerten ändert die Vorgabe nicht.
            {!saved.pct && ' Aktuell keine Vorgabe — die Felder starten leer.'}
          </div>
        </div>
      </div>
      <div className="admin-table-wrap" style={{ padding: 16 }}>
        {error && <div className="admin-form-error" style={{ marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label className="admin-form-label">Skonto (%)</label>
            <input
              className="admin-form-input"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={pct}
              onChange={e => onPctChange(e.target.value)}
              placeholder="z.B. 2"
            />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label className="admin-form-label">Frist (Tage)</label>
            <input
              className="admin-form-input"
              type="number"
              step="1"
              min="0"
              value={days}
              onChange={e => onDaysChange(e.target.value)}
              placeholder="z.B. 10"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => onSave(false)}
            disabled={saving || (pct === saved.pct && days === saved.days)}
          >
            {saving ? 'Speichern…' : 'Vorgabe speichern'}
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => onSave(true)}
            disabled={saving || (!saved.pct && !saved.days)}
          >
            Vorgabe entfernen
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Ohne Prozentsatz gibt es keine Vorgabe — die Frist allein bewirkt nichts.
          </span>
        </div>
      </div>
    </>
  )
}
