import { useEffect, useId, useState } from 'react'
import { searchKreditorenProjekte, type CompactProject } from '../../api/kreditoren'
import { projektText } from './kreditorenLogik'

/**
 * Projekt für eine Position der Lieferantenrechnung — Spec §3.6/§4.6.
 *
 * Dasselbe Prinzip wie beim Lieferschein: **Auswahl statt Freitext**. Die
 * Kandidaten des Servers (Kommission/Objekt auf dem Beleg) stehen als
 * Schnellauswahl da, sonst die Suche. Anders als beim Lieferschein sucht sie über
 * **alle** Projekte, auch abgeschlossene — die Rechnung kommt oft nach dem
 * Abschluss. Antippen wählt nur; gespeichert wird mit «Speichern».
 */

interface Props {
  value: CompactProject | null
  kandidaten: CompactProject[]
  disabled?: boolean
  onChange: (p: CompactProject | null) => void
}

const SEARCH_DELAY_MS = 300
const MIN_QUERY = 2

export default function KreditorProjektWahl({ value, kandidaten, disabled, onChange }: Props) {
  const feldId = useId()
  const [offen, setOffen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompactProject[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) return
    let aktiv = true
    const timer = setTimeout(() => {
      setSearching(true)
      setError(false)
      searchKreditorenProjekte(q)
        .then(r => { if (aktiv) setResults(r) })
        .catch(() => { if (aktiv) { setResults([]); setError(true) } })
        .finally(() => { if (aktiv) setSearching(false) })
    }, SEARCH_DELAY_MS)
    return () => { aktiv = false; clearTimeout(timer) }
  }, [query])

  function waehle(p: CompactProject | null) {
    onChange(p)
    setOffen(false)
    setQuery('')
    setResults(null)
  }

  if (value && !offen) {
    return (
      <div className="kred-projekt-gewaehlt">
        <span title={[projektText(value), value.customer, value.locality].filter(Boolean).join(' · ')}>
          {projektText(value)}
        </span>
        {!disabled && (
          <>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => setOffen(true)} aria-label="Projekt ändern">✎</button>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => onChange(null)} aria-label="Projekt entfernen">✕</button>
          </>
        )}
      </div>
    )
  }

  if (!offen) {
    return disabled
      ? <span style={{ color: 'var(--muted)' }}>—</span>
      : (
        <div className="kred-projekt-wahl">
          {kandidaten.slice(0, 3).map(p => (
            <button key={p.project_id} type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => waehle(p)} title="Vorschlag vom Beleg">
              → {projektText(p)}
            </button>
          ))}
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setOffen(true)}>
            Projekt wählen
          </button>
        </div>
      )
  }

  const suchtAktiv = query.trim().length >= MIN_QUERY
  const kandidatIds = new Set(kandidaten.map(k => k.project_id))
  const treffer = suchtAktiv ? (results ?? []).filter(p => !kandidatIds.has(p.project_id)) : []

  return (
    <div className="kred-projekt-wahl">
      <input
        id={feldId}
        aria-label="Projekt suchen"
        type="search"
        className="admin-form-input"
        value={query}
        autoFocus
        autoComplete="off"
        placeholder="Nummer, Name, Kunde, Ort"
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setOffen(false) }}
      />
      <div className="kred-projekt-treffer">
        {kandidaten.map(p => (
          <button key={p.project_id} type="button" onClick={() => waehle(p)}>
            {projektText(p)} <span style={{ color: 'var(--muted)' }}>· Vorschlag</span>
          </button>
        ))}
        {suchtAktiv && searching && <span style={{ color: 'var(--muted)' }}>Suche…</span>}
        {suchtAktiv && error && <span role="alert" style={{ color: 'var(--danger)' }}>Die Suche hat nicht geklappt.</span>}
        {suchtAktiv && !searching && !error && results && results.length === 0 && (
          <span style={{ color: 'var(--muted)' }}>Kein Projekt gefunden.</span>
        )}
        {treffer.map(p => (
          <button key={p.project_id} type="button" onClick={() => waehle(p)}
                  title={[p.customer, p.locality].filter(Boolean).join(' · ')}>
            {projektText(p)}
            {p.customer && <span style={{ color: 'var(--muted)' }}> · {p.customer}</span>}
          </button>
        ))}
      </div>
      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setOffen(false)}>
        Abbrechen
      </button>
    </div>
  )
}
