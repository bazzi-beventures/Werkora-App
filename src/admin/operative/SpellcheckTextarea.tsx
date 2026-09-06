import { useState, type ReactNode } from 'react'
import { checkSpelling, composeQuoteDescription } from '../../api/admin/spellcheck'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  /** Zweiter Knopf «Beschreibung formulieren»: macht aus den Stichworten den
   *  Fliesstext, der in die Offerte kommt. Nur dort sinnvoll, wo der Inhalt des
   *  Felds am Ende beim Kunden landet — deshalb ein Schalter und kein Default. */
  compose?: boolean
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
      <mark key={i} style={{ background: 'var(--warning-soft)', color: 'var(--warning-ink)', borderRadius: 3, padding: '0 2px' }}>{part}</mark>
    )
  })
}

/** Welcher der beiden Knöpfe den offenen Vorschlag erzeugt hat. Davon hängen
 *  Titel, Hilfetext und die Hervorhebung ab — beim Ausformulieren ist praktisch
 *  jedes Wort neu, eine Markierung wäre dort eine gelbe Fläche ohne Aussage. */
type SuggestionKind = 'spell' | 'compose'

const SUGGESTION_TITLE: Record<SuggestionKind, string> = {
  spell: 'Rechtschreibung prüfen',
  compose: 'Beschreibung formulieren',
}

/**
 * Textarea mit zwei Mistral-Hilfen auf Knopfdruck:
 *
 *   * «Rechtschreibung prüfen» — korrigiert Tippfehler und lässt den Stichwort-Stil
 *     stehen (fügt bewusst nichts hinzu).
 *   * «Beschreibung formulieren» (Prop `compose`) — macht aus den Stichworten den
 *     fertigen Fliesstext für die Offerte. Aufbau und Ton kommen aus der Vorgabe des
 *     Mandanten (Offert-Vorlagen); der Inhalt bleibt der des Anwenders.
 *
 * Beide zeigen ihren Vorschlag im selben Popup und übernehmen ihn erst nach
 * Bestätigung — was beim Kunden landet, entsteht nie ungesehen.
 */
export function SpellcheckTextarea({ value, onChange, placeholder, rows = 5, compose = false }: Props) {
  const [busy, setBusy] = useState<SuggestionKind | null>(null)
  const [error, setError] = useState('')
  const [noErrors, setNoErrors] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [kind, setKind] = useState<SuggestionKind>('spell')
  const [original, setOriginal] = useState('')

  async function run(next: SuggestionKind) {
    if (!value.trim() || busy) return
    setBusy(next)
    setError('')
    setNoErrors(false)
    try {
      const proposal = next === 'spell'
        ? await checkSpelling(value).then(r => (r.changed ? r.corrected : ''))
        : await composeQuoteDescription(value).then(r => (r.changed ? r.description : ''))
      if (proposal.trim() && proposal.trim() !== value.trim()) {
        setOriginal(value)
        setKind(next)
        setSuggestion(proposal)
      } else {
        // Beim Ausformulieren heisst «nichts zurückgekommen» nicht «alles gut»:
        // der Text bleibt dann unverändert stehen, und das muss man sehen.
        if (next === 'spell') setNoErrors(true)
        else setError('Es kam kein Vorschlag zurück. Bitte mit etwas mehr Stichworten erneut versuchen.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : (
        next === 'spell' ? 'Rechtschreibprüfung fehlgeschlagen' : 'Formulieren fehlgeschlagen'
      ))
    } finally {
      setBusy(null)
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
          onClick={() => run('spell')}
          disabled={!!busy || !value.trim()}
        >
          {busy === 'spell' ? 'Prüft…' : '✓ Rechtschreibung prüfen'}
        </button>
        {compose && (
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => run('compose')}
            disabled={!!busy || !value.trim()}
            title="Aus den Stichworten einen fertigen Offerttext machen"
          >
            {busy === 'compose' ? 'Formuliert…' : '✎ Beschreibung formulieren'}
          </button>
        )}
        {noErrors && <span style={{ color: 'var(--success, #2e7d32)', fontSize: 13 }}>Keine Fehler gefunden ✓</span>}
        {error && <span style={{ color: 'var(--danger, #c62828)', fontSize: 13 }}>{error}</span>}
      </div>

      {suggestion !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setSuggestion(null) }}
        >
          <div style={{ background: 'var(--bg, #fff)', borderRadius: 12, padding: 24, maxWidth: 640, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{SUGGESTION_TITLE[kind]}</h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: 'var(--muted, #666)', fontSize: 13 }}>
              {kind === 'spell' ? (
                <>
                  Geänderte Stellen sind{' '}
                  <mark style={{ background: 'var(--warning-soft)', color: 'var(--warning-ink)', borderRadius: 3, padding: '0 2px' }}>markiert</mark>.
                  Prüfe den Vorschlag und übernimm ihn — oder verwirf ihn.
                </>
              ) : (
                <>
                  Der Vorschlag geht so zum Kunden. Bitte auf Produkte, Farben und
                  Leistungen prüfen, bevor du ihn übernimmst.
                </>
              )}
            </p>

            <label className="admin-form-label">{kind === 'spell' ? 'Original' : 'Deine Stichworte'}</label>
            <div style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border, #e0e0e0)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 13, color: 'var(--muted, #666)', marginBottom: 14 }}>
              {original}
            </div>

            <label className="admin-form-label">Vorschlag</label>
            <div style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--border, #e0e0e0)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
              {kind === 'spell' ? highlightChanges(original, suggestion) : suggestion}
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
