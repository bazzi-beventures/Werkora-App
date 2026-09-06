import { backdropCloseProps } from '../../../shared/backdropClose'
import type { SpecialMode } from '../../../api/admin/quoteTemplates'
import type { EditState, FormState } from './types'

// Erfassen/Bearbeiten einer Positions-Vorlage. Der Zustand (Formular, Fehler,
// Dirty-Check) liegt weiter im Panel — diese Datei ist die Maske dazu.

/** Beschriftung des Betragsfelds je Preismodell einer Sonderposition — der Betrag
 *  bedeutet in jedem Modell etwas anderes (Summe, Ansatz je Stunde, Preis je Stück). */
const SPECIAL_FEE_LABEL: Record<SpecialMode, string> = {
  pauschal: 'Betrag CHF *',
  stunden: 'Stundenansatz CHF/h *',
  stueck: 'Stückpreis CHF/Stk *',
}

/** Beschriftung des Mengen-Vorschlags. 'pauschal' hat keine Menge und kein Feld. */
const SPECIAL_QUANTITY_LABEL: Record<Exclude<SpecialMode, 'pauschal'>, string> = {
  stunden: 'Vorgeschlagene Stunden *',
  stueck: 'Vorgeschlagene Stückzahl *',
}
interface Props {
  editing: EditState
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  error: string
  saving: boolean
  // true = seit dem Öffnen wurde etwas eingetippt; dann fragt der Backdrop-Klick
  // über onBackdropBlocked nach, statt die Eingaben wegzuwerfen.
  dirty: boolean
  onBackdropBlocked: () => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  onDelete: () => void
}

export function PositionTemplateModal({
  editing, form, setForm, error, saving, dirty, onBackdropBlocked, onClose, onSubmit, onDelete,
}: Props) {
  const isSpecialModal = editing.kind === 'special'

  return (
    <div
      className="admin-modal-overlay"
      {...backdropCloseProps(onClose, {
        blockWhen: () => dirty,
        onBlocked: onBackdropBlocked,
      })}
    >
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">
            {editing.id === 'new'
              ? (isSpecialModal ? 'Neue Sonderposition' : 'Neue Montage-Vorlage')
              : 'Vorlage bearbeiten'}
          </div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={onSubmit} className="admin-modal-body">
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-group">
            <label className="admin-form-label">Bezeichnung *</label>
            <input
              className="admin-form-input"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder={isSpecialModal ? 'z.B. Demontage Komplettanlage' : 'z.B. Montage Standard'}
              required
              autoFocus
            />
          </div>

          {isSpecialModal && (
            <div className="admin-form-group">
              <label className="admin-form-label">Preismodell</label>
              <select
                className="admin-form-input"
                value={form.pricing_mode}
                onChange={e => setForm(f => ({ ...f, pricing_mode: e.target.value as SpecialMode }))}
              >
                <option value="pauschal">Pauschale (Fixbetrag)</option>
                <option value="stunden">Stundenansatz (CHF/h)</option>
                <option value="stueck">Stückpreis (CHF/Stk)</option>
              </select>
            </div>
          )}

          <div className="admin-form-group">
            <label className="admin-form-label">
              {isSpecialModal ? SPECIAL_FEE_LABEL[form.pricing_mode] : 'Betrag CHF *'}
            </label>
            <input
              className="admin-form-input"
              type="number"
              step="0.05"
              min="0"
              value={form.default_fee}
              onChange={e => setForm(f => ({ ...f, default_fee: e.target.value }))}
              required
              placeholder="z.B. 150"
            />
          </div>

          {/* Mengen-Vorschlag: dieselbe Spalte (default_hours) für Stunden und Stück —
              bei einer Pauschale gibt es keine Menge, also auch kein Feld. */}
          {isSpecialModal && form.pricing_mode !== 'pauschal' && (
            <div className="admin-form-group">
              <label className="admin-form-label">{SPECIAL_QUANTITY_LABEL[form.pricing_mode]}</label>
              <input
                className="admin-form-input"
                type="number"
                step={form.pricing_mode === 'stueck' ? '1' : '0.5'}
                min="0"
                value={form.default_hours}
                onChange={e => setForm(f => ({ ...f, default_hours: e.target.value }))}
                required
                placeholder="z.B. 2"
              />
            </div>
          )}

          <div className="admin-form-group">
            <label className="admin-form-label">Notiz (optional)</label>
            <input
              className="admin-form-input"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Interne Notiz / Hinweis"
            />
          </div>
        </form>
        <div className="admin-modal-footer">
          {editing.id !== 'new' && (
            <button className="admin-btn admin-btn-danger" onClick={onDelete} disabled={saving} style={{ marginRight: 'auto' }}>
              Löschen
            </button>
          )}
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
            disabled={saving}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
