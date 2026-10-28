import { useEffect, useState } from 'react'
import { searchLieferscheinProjekte, type LieferscheinProjekt } from '../api/lieferscheine'

/**
 * Projekt wählen für einen Lieferschein — docs/specs/lieferschein-erfassung.md §4.
 *
 * Für Monteur-App und Eingang des Büros dieselbe Auswahl: **zuoberst die Suche**
 * über offene Projekte, darunter die Vorschläge (auf dem Lieferschein gefundene
 * Nummern, markiert). **Auswahl statt Freitext** — der Mensch tippt ein Projekt
 * an, er tippt keine Nummer ab (vgl. das Projektnummer-Fehlerbild in
 * services/CLAUDE.md). Welche Projekte die Suche liefert, entscheidet der
 * Server (zugewiesene bzw. alle offenen mit dem Recht «Wareneingang»).
 *
 * Ohne Treffer auf dem Lieferschein zeigt die Auswahl **keine** Projekte, bis
 * jemand ins Suchfeld tippt (Rückmeldung 2026-10-26): bei 400 offenen Projekten
 * war jede Vorauswahl eine willkürliche.
 *
 * Während der Zuordnung läuft (`busy`), trägt die angetippte Zeile «Wird
 * zugeordnet…» — sonst sähe das Antippen aus, als sei nichts passiert.
 */

interface Props {
  candidates: LieferscheinProjekt[]
  busy?: boolean
  onPick: (p: LieferscheinProjekt) => void
}

const SEARCH_DELAY_MS = 300
const MIN_QUERY = 2

function Zeile({ p, tag, busy, active, onPick }: {
  p: LieferscheinProjekt; tag?: string; busy?: boolean; active?: boolean
  onPick: (p: LieferscheinProjekt) => void
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPick(p)}
      aria-label={`${p.number} ${p.name}`}
      aria-busy={active || undefined}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
        width: '100%', textAlign: 'left', padding: '10px 12px',
        cursor: busy ? 'wait' : 'pointer',
        borderRadius: 'var(--radius-sm, 8px)',
        border: active ? '2px solid var(--accent-green, #16a34a)' : '1px solid var(--border, #e5e7eb)',
        background: 'transparent', color: 'inherit', font: 'inherit',
        opacity: busy && !active ? 0.45 : 1,
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
      {active && (
        <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-green, #16a34a)' }}>
          Wird zugeordnet…
        </span>
      )}
    </button>
  )
}

export default function LieferscheinProjektAuswahl({ candidates, busy, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LieferscheinProjekt[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) { setResults(null); return }
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

  function pick(p: LieferscheinProjekt) {
    setPicked(p.project_id)
    onPick(p)
  }

  const activeId = busy ? picked : null
  const suchtAktiv = query.trim().length >= MIN_QUERY
  const kandidatIds = new Set(candidates.map(c => c.project_id))
  // Ein Suchtreffer, der schon als Vorschlag dasteht, nicht doppelt zeigen.
  const treffer = (results ?? []).filter(p => !kandidatIds.has(p.project_id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor="ls-suche" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
        Projekt suchen
      </label>
      <input
        id="ls-suche"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Nummer, Name, Kunde oder Ort"
        disabled={busy}
        autoComplete="off"
        style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm, 8px)',
          border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
          color: 'inherit', font: 'inherit',
        }}
      />
      {suchtAktiv && searching && <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>Suche…</div>}
      {suchtAktiv && error && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--danger, #ef4444)' }}>Die Suche hat nicht geklappt.</div>
      )}
      {suchtAktiv && results && !searching && !error && results.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>Kein offenes Projekt gefunden.</div>
      )}
      {suchtAktiv && treffer.map(p => (
        <Zeile key={p.project_id} p={p} busy={busy} active={activeId === p.project_id} onPick={pick} />
      ))}

      {candidates.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b7280)', marginTop: 4 }}>Vorschlag</div>
          {candidates.map(p => (
            <Zeile key={p.project_id} p={p} tag="auf dem Lieferschein gefunden"
                   busy={busy} active={activeId === p.project_id} onPick={pick} />
          ))}
        </>
      )}
      {!suchtAktiv && candidates.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>
          Auf dem Lieferschein wurde keine Projektnummer erkannt. Tippe mindestens {MIN_QUERY} Zeichen ins Suchfeld.
        </div>
      )}
    </div>
  )
}
