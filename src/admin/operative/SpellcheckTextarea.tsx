import { useState, type ReactNode } from 'react'
import { checkSpelling } from '../../api/admin/spellcheck'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

// Wort-Level-Hervorhebung: markiert Tokens im Vorschlag, die so nicht (mehr) im
// Original vorkommen. Einfache Multiset-Heuristik — reicht als visuelle Hilfe fuer
// kurze Stichworttexte. Uebernommen wird immer der rohe Vorschlagstext, nicht diese
// Darstellung.
function highlightChanges(original: string, suggestion: string): ReactNode[] {
  const counts = new Map<string, number>()
  for (const t of original.split(/\s+/).filter(Boolean)) {
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return suggestion.split(/(\s+)/).map((part, i) => {
    if (part === '' || /^\s+$/.test(part)) return <span key={i}>{part}</span>
    const n = counts.get(part) ?? 0
    if (n > 0) {
      counts.set(part, n - 1)
      return <span key={i}>{part}</span>
    }
    return (
      <mark key={i} style={{ background: '#fff3cd', color: '#7a5b00', borderRadius: 3, padding: '0 2px' }}>{part}</mark>
    )
  })
}

/**
 * Textarea mit Mistral-Rechtschreibpruefung auf Knopfdruck. Zeigt den korrigierten
 * Vorschlag in einem Popup (geaenderte Woerter hervorgehoben) und uebernimmt ihn erst
 * nach Bestaetigung. Gedacht fuer kurze, stichwortartige Texte (z.B. Produktbeschreibung).
 */
export function SpellcheckTextarea({ value, onChange, placeholder, rows = 5 }: Props) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [noErrors, setNoErrors] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [original, setOriginal] = useState('')

  async function runCheck() {
    if (!value.trim()) return
    setChecking(true)
    setError('')
    setNoErrors(false)
    try {
      const res = await checkSpelling(value)
      if (res.changed && res.corrected.trim() !== value.trim()) {
        setOriginal(value)
        setSuggestion(res.corrected)
      } else {
        setNoErrors(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rechtschreibprüfung fehlgeschlagen')
    } finally {
      setChecking(false)
    }
  }

  function applySuggestion() {
    if (suggestion !== null) onChange(suggestion)
    setSuggestion(null)
  }

  return (
    <div>
      <textarea
        className="admin-form-input"
        rows={rows}
        style={{ resize: 'vertical', minHeight: 100 }}
        value={value}
        onChange={e => { onChange(e.target.value); setNoErrors(false) }}
        placeholder={placeholder}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={runCheck}
          disabled={checking || !value.trim()}
        >
          {checking ? 'Prüft…' : '✓ Rechtschreibung prüfen'}
        </button>
        {noErrors && <span style={{ color: 'var(--success, #2e7d32)', fontSize: 13 }}>Keine Fehler gefunden ✓</span>}
        {error && <span style={{ color: 'var(--danger, #c62828)', fontSize: 13 }}>{error}</span>}
      </div>

      {suggestion !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setSuggestion(null) }}
        >
          <div style={{ background: 'var(--bg, #fff)', borderRadius: 12, padding: 24, maxWidth: 640, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Rechtschreibung prüfen</h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: 'var(--muted, #666)', fontSize: 13 }}>
              Geänderte Stellen sind{' '}
              <mark style={{ background: '#fff3cd', color: '#7a5b00', borderRadius: 3, padding: '0 2px' }}>markiert</mark>.
              Prüfe den Vorschlag und übernimm ihn — oder verwirf ihn.
            </p>

            <label className="admin-form-label">Original</label>
            <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-muted, #f7f7f7)', border: '1px solid var(--border, #e0e0e0)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--muted, #666)', marginBottom: 14 }}>
              {original}
            </div>

            <label className="admin-form-label">Vorschlag</label>
            <div style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--border, #e0e0e0)', borderRadius: 8, padding: 10, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
              {highlightChanges(original, suggestion)}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setSuggestion(null)}>Verwerfen</button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={applySuggestion}>Übernehmen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
