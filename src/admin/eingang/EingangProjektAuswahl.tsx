import { useEffect, useId, useState } from 'react'
import { searchMailEingangProjekte, type EingangProjekt } from '../../api/admin/mailEingang'

/**
 * Projekt wählen für eine Projektnotiz aus dem Mail-Eingang —
 * docs/specs/mail-eingang-triage.md §4.
 *
 * Dasselbe Prinzip wie beim Lieferschein (`shared/LieferscheinProjektAuswahl`):
 * **Auswahl statt Freitext** — die Kandidaten des Servers zum Antippen, sonst die
 * Suche. Anders als dort löst das Antippen hier nichts aus: es wählt nur, geschrieben
 * wird erst mit «Übernehmen». Deshalb eine eigene, kleinere Komponente statt der
 * geteilten, die beim Antippen sofort zuordnet.
 *
 * **Gewählt heisst zugeklappt:** steht ein Projekt fest (vom Server vorgewählt,
 * vom Büro angetippt oder von einem anderen Vorschlag derselben Mail übernommen),
 * zeigt die Auswahl nur noch diese eine Zeile und «Anderes Projekt wählen». Sonst
 * stünden zwanzig Suchtreffer zwischen der Wahl und dem Knopf «Übernehmen».
 */

interface Props {
  candidates: EingangProjekt[]
  selected: EingangProjekt | null
  disabled?: boolean
  onPick: (p: EingangProjekt) => void
  /** Zeile über dem gewählten Projekt, z.B. woher es übernommen ist. */
  hinweis?: string
}

const SEARCH_DELAY_MS = 300
const MIN_QUERY = 2

export default function EingangProjektAuswahl({ candidates, selected, disabled, onPick, hinweis }: Props) {
  const feldId = useId()
  const [aendern, setAendern] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EingangProjekt[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) { setResults(null); return }
    let aktiv = true
    const timer = setTimeout(() => {
      setSearching(true)
      setError(false)
      searchMailEingangProjekte(q)
        .then(r => { if (aktiv) setResults(r) })
        .catch(() => { if (aktiv) { setResults([]); setError(true) } })
        .finally(() => { if (aktiv) setSearching(false) })
    }, SEARCH_DELAY_MS)
    return () => { aktiv = false; clearTimeout(timer) }
  }, [query])

  const suchtAktiv = query.trim().length >= MIN_QUERY
  const kandidatIds = new Set(candidates.map(c => c.project_id))
  // Ein Suchtreffer, der schon als Kandidat dasteht, nicht doppelt zeigen.
  const treffer = suchtAktiv ? (results ?? []).filter(p => !kandidatIds.has(p.project_id)) : []
  // Ein über die Suche gewähltes Projekt bleibt sichtbar, auch wenn das Suchfeld
  // danach geleert wird — sonst wäre unklar, was «Übernehmen» gleich beschreibt.
  const gewaehltAusSuche = selected
    && !kandidatIds.has(selected.project_id)
    && !treffer.some(p => p.project_id === selected.project_id)
    ? selected : null

  const zeile = (p: EingangProjekt) => {
    const gewaehlt = selected?.project_id === p.project_id
    return (
      <button
        key={p.project_id}
        type="button"
        className={`eingang-projekt${gewaehlt ? ' gewaehlt' : ''}`}
        aria-pressed={gewaehlt}
        aria-label={`${p.number} ${p.name}`.trim()}
        disabled={disabled}
        onClick={() => { onPick(p); setAendern(false); setQuery('') }}
      >
        <span className="eingang-projekt-name">{p.number ? `${p.number} · ` : ''}{p.name}</span>
        {(p.customer || p.locality) && (
          <span className="eingang-projekt-zusatz">{[p.customer, p.locality].filter(Boolean).join(' · ')}</span>
        )}
      </button>
    )
  }

  if (selected && !aendern) {
    return (
      <div className="eingang-projekte">
        <div className="eingang-hinweis">{hinweis ?? 'Projekt'}</div>
        {zeile(selected)}
        <div>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={disabled} onClick={() => setAendern(true)}>
            Anderes Projekt wählen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="eingang-projekte">
      {candidates.length > 0 && (
        <>
          <div className="eingang-hinweis">
            {candidates.length === 1 ? 'Vorgeschlagenes Projekt' : 'Vorgeschlagene Projekte'}
          </div>
          {candidates.map(zeile)}
        </>
      )}
      {gewaehltAusSuche && zeile(gewaehltAusSuche)}

      <label htmlFor={feldId} className="admin-form-label">
        {candidates.length > 0 ? 'Anderes Projekt suchen' : 'Projekt suchen'}
      </label>
      <input
        id={feldId}
        type="search"
        className="admin-form-input"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Nummer, Name, Kunde oder Ort"
        disabled={disabled}
        autoComplete="off"
      />
      {suchtAktiv && searching && <div className="eingang-hinweis">Suche…</div>}
      {suchtAktiv && error && (
        <div role="alert" className="admin-form-error">Die Suche hat nicht geklappt.</div>
      )}
      {suchtAktiv && results && !searching && !error && results.length === 0 && (
        <div className="eingang-hinweis">Kein Projekt gefunden.</div>
      )}
      {treffer.map(zeile)}
      {!suchtAktiv && candidates.length === 0 && !selected && (
        <div className="eingang-hinweis">
          Zu dieser Mail wurde kein Projekt erkannt. Tippe mindestens {MIN_QUERY} Zeichen ins Suchfeld.
        </div>
      )}
    </div>
  )
}
