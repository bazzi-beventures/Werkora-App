import { useEffect, useRef, useState } from 'react'

import { listProjects } from '../../../api/admin/projects'
import type { Project } from '../../../api/admin/projects'
import { referenceLabel } from './useProjectForm'

// Das Feld «Bezieht sich auf Projekt» (Spec docs/specs/garantiefall.md §3.9).
//
// Sichtbar, sobald die Leistungsart «Reparatur» gewaehlt ist. Es beantwortet die
// Frage, die bei jeder Reparatur zuerst kommt: zu welchem Auftrag gehoert sie?
// Bis hierher gab es darauf genau eine Antwort — das alte Projekt
// wiedereroeffnen —, und die faerbte den abgeschlossenen Auftrag rueckwirkend
// ein (Spec §2.2). Jetzt entsteht ein eigenes Projekt mit Rueckverweis, das
// Kunde, Objekt und Kontakte aus dem Referenzprojekt uebernimmt.
//
// Kein neuer Endpoint und kein neuer Picker: gesucht wird ueber dieselbe
// Projektliste wie die Tabelle, und die liefert bereits vollstaendige Zeilen —
// die Uebernahme braucht deshalb keine zweite Abfrage.

const TIPP_DELAY_MS = 300
const MAX_TREFFER = 8

export function ReferenceProjectPicker({
  value, label, onPick, disabled,
}: {
  /** Gesetzter Verweis (Projekt-id) oder '' . */
  value: string
  /** Anzeigename des gewaehlten Projekts; leer, solange nur die id bekannt ist. */
  label: string
  onPick: (project: Project | null) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [treffer, setTreffer] = useState<Project[]>([])
  const [suchend, setSuchend] = useState(false)
  const [offen, setOffen] = useState(false)
  // Jede Antwort traegt die Anfrage, zu der sie gehoert. Ohne das ueberschreibt
  // eine langsame frühere Suche die Treffer einer späteren — der Anwender sieht
  // dann Ergebnisse zu einem Text, den er schon weitergetippt hat.
  const laufendeSuche = useRef(0)

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setTreffer([])
      setSuchend(false)
      return
    }
    const lauf = ++laufendeSuche.current
    setSuchend(true)
    const timer = setTimeout(() => {
      listProjects({
        // 'all' statt 'closed': eine Reparatur kann sich auch auf einen Auftrag
        // beziehen, der noch laeuft (Mangel vor der Schlussabnahme entdeckt).
        status: 'all', sort: 'created_at', dir: 'desc',
        page: 1, pageSize: MAX_TREFFER, search: text,
      })
        .then(res => {
          if (lauf !== laufendeSuche.current) return
          setTreffer(res.rows.filter(r => r.kind === 'project'))
        })
        .catch(() => {
          if (lauf === laufendeSuche.current) setTreffer([])
        })
        .finally(() => {
          if (lauf === laufendeSuche.current) setSuchend(false)
        })
    }, TIPP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  function waehle(project: Project) {
    onPick(project)
    setQuery('')
    setTreffer([])
    setOffen(false)
  }

  if (value) {
    return (
      <div className="admin-form-group">
        <label className="admin-form-label">Bezieht sich auf Projekt</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius-xs)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            {label || 'Referenzprojekt gewählt'}
          </span>
          {!disabled && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => onPick(null)}
              aria-label="Referenzprojekt entfernen"
              style={{ fontSize: 13 }}
            >
              Entfernen
            </button>
          )}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          Kunde, Objekt und Ansprechpersonen wurden von dort übernommen, soweit die
          Maske dazu nichts Eigenes hatte. Ob die Arbeit auf Garantie geht,
          entscheidest du unten beim Häkchen «Garantiefall».
        </p>
      </div>
    )
  }

  return (
    <div className="admin-form-group">
      <label className="admin-form-label" htmlFor="reference-project">
        Bezieht sich auf Projekt
        <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>(optional)</span>
      </label>
      <input
        id="reference-project"
        className="admin-form-input"
        value={query}
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); setOffen(true) }}
        onFocus={() => setOffen(true)}
        placeholder="Projektnummer, Name oder Kunde des ursprünglichen Auftrags…"
        autoComplete="off"
      />
      {offen && query.trim().length >= 2 && (
        <div style={{
          marginTop: 4, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
          background: 'var(--surface)', maxHeight: 240, overflowY: 'auto',
        }}>
          {suchend && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--muted)' }}>Suche…</div>
          )}
          {!suchend && treffer.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--muted)' }}>
              Kein Projekt gefunden.
            </div>
          )}
          {treffer.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => waehle(p)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                color: 'var(--text)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{referenceLabel(p)}</span>
              {(p.customer?.name || p.object_address) && (
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>
                  {[p.customer?.name, p.object_address].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        Bei einer Reparatur an einem früheren Auftrag: Kunde, Objekt und
        Ansprechpersonen werden übernommen, und der alte Auftrag behält seine Kennzahlen.
      </p>
    </div>
  )
}
