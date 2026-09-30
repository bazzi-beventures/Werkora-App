import { useState } from 'react'
import {
  MAX_GERUESTFAECHER, addGeruestfaecher, parseGeruestfaecherInput,
} from '../../../shared/geruestfaecher'

/**
 * Mehrere Gerüstfächer je Projekt (Feature «geruestfach»): Chips mit ×, dazu ein
 * Eingabefeld. Übernommen wird mit Enter, Komma oder beim Verlassen des Felds —
 * Letzteres, damit ein getipptes, aber nicht bestätigtes «2C» beim Speichern
 * nicht verloren geht (der Blur feuert vor dem Klick auf «Speichern»).
 */
export default function GeruestfaecherInput({ value, onChange }: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    if (!draft.trim()) return
    const { valid, invalid } = parseGeruestfaecherInput(draft)
    const next = addGeruestfaecher(value, valid)
    if (next.length !== value.length) onChange(next)
    if (invalid.length > 0) {
      setError(`Ungültig: ${invalid.join(', ')} — erlaubt sind Ziffern und Buchstaben, z. B. 2C.`)
      setDraft(invalid.join(' '))
    } else if (value.length + valid.length > MAX_GERUESTFAECHER && next.length === MAX_GERUESTFAECHER) {
      setError(`Höchstens ${MAX_GERUESTFAECHER} Gerüstfächer je Projekt.`)
      setDraft('')
    } else {
      setError(null)
      setDraft('')
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="geruestfach-chips" aria-label="Gerüstfächer">
          {value.map(fach => (
            <span key={fach} className="geruestfach-chip">
              {fach}
              <button
                type="button"
                className="geruestfach-chip-remove"
                aria-label={`Gerüstfach ${fach} entfernen`}
                onClick={() => onChange(value.filter(f => f !== fach))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id="project-geruestfaecher"
        className="admin-form-input"
        type="text"
        autoCapitalize="characters"
        autoComplete="off"
        value={draft}
        onChange={e => { setDraft(e.target.value); setError(null) }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={commit}
        placeholder={value.length ? 'weiteres Fach, z. B. 14' : 'z. B. 2C'}
      />
      {error && (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--danger, #dc2626)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
