import { useEffect, useState } from 'react'
import { searchLieferscheinProjekte, type LieferscheinProjekt } from '../api/lieferscheine'

/**
 * Projekt wählen für einen Lieferschein — docs/specs/lieferschein-erfassung.md §4.
 *
 * Für Monteur-App und Eingang des Büros dieselbe Auswahl: oben die Vorschläge
 * (auf dem Lieferschein gefundene Nummern, markiert), dann «deine Projekte»,
 * darunter die Suche über offene Projekte. **Auswahl statt Freitext** — der
 * Mensch tippt ein Projekt an, er tippt keine Nummer ab (vgl. das
 * Projektnummer-Fehlerbild in services/CLAUDE.md). Welche Projekte die Suche
 * liefert, entscheidet der Server (zugewiesene bzw. alle offenen mit dem Recht
 * «Wareneingang»).
 */

interface Props {
  candidates: LieferscheinProjekt[]
  recent?: LieferscheinProjekt[]
  busy?: boolean
  onPick: (p: LieferscheinProjekt) => void
}

const SEARCH_DELAY_MS = 300

function Zeile({ p, tag, busy, onPick }: {
  p: LieferscheinProjekt; tag?: string; busy?: boolean; onPick: (p: LieferscheinProjekt) => void
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPick(p)}
      aria-label={`${p.number} ${p.name}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
        width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
        borderRadius: 'var(--radius-sm, 8px)', border: '1px solid var(--border, #e5e7eb)',
        background: 'transparent', color: 'inherit', font: 'inherit',
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {p.number ? `${p.number} · ` : ''}{p.name}
        {tag && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--accent-green, #16a34a)' }}>
            {tag}
          </span>
        )}
      </span>
      {(p.customer || p.locality) && (
        <span style={{ fontSize: 12.5, color: 'var(--muted, #6b7280)' }}>
          {[p.customer, p.locality].filter(Boolean).join(' · ')}
        </span>
      )}
    </button>
  )
}

export default function LieferscheinProjektAuswahl({ candidates, recent = [], busy, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LieferscheinProjekt[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); return }
    let aktiv = true
    const timer = setTimeout(() => {
      setSearching(true)
      setError(false)
      searchLieferscheinProjekte(q)
        .then(r => { if (aktiv) setResults(r) })
        .catch(() => { if (aktiv) { setResults([]); setError(true) } })
        .finally(() => { if (aktiv) setSearching(false) })
    }, SEARCH_DELAY_MS)
    return () => { aktiv = false; clearTimeout(timer) }
  }, [query])

  const shown = new Set(candidates.map(c => c.project_id))
  const eigene = recent.filter(p => !shown.has(p.project_id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {candidates.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b7280)' }}>Vorschlag</div>
          {candidates.map(p => (
            <Zeile key={p.project_id} p={p} tag="auf dem Lieferschein gefunden" busy={busy} onPick={onPick} />
          ))}
        </>
      )}
      {eigene.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b7280)' }}>Deine Projekte</div>
          {eigene.map(p => <Zeile key={p.project_id} p={p} busy={busy} onPick={onPick} />)}
        </>
      )}
      <label htmlFor="ls-suche" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b7280)', marginTop: 4 }}>
        Projekt suchen
      </label>
      <input
        id="ls-suche"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Nummer, Name, Kunde oder Ort"
        style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm, 8px)',
          border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
          color: 'inherit', font: 'inherit',
        }}
      />
      {searching && <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>Suche…</div>}
      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--danger, #ef4444)' }}>Die Suche hat nicht geklappt.</div>}
      {results && !searching && !error && results.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>Kein offenes Projekt gefunden.</div>
      )}
      {results?.map(p => <Zeile key={p.project_id} p={p} busy={busy} onPick={onPick} />)}
    </div>
  )
}
