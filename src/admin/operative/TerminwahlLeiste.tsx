import type { TerminwahlPlanung } from './useTerminwahlPlanung'

// Knöpfe der Terminwahl in der Werkzeugleiste der Einsatzplanung
// (docs/specs/servicebegleitung.md §7.3, §7.6): Reservationen zeigen/ausblenden und —
// ohne Aufgaben-Board — der Zähler «Terminanfragen ohne Antwort» mit den Fällen,
// bei denen das Büro anrufen muss. Ein Klick öffnet das Projekt.

interface Props {
  planung: TerminwahlPlanung
  projektName: (projectId: string) => string
  onOpenProject?: (projectId: string) => void
}

export function TerminwahlLeiste({ planung, projektName, onOpenProject }: Props) {
  const { reservationen, zeigen, umschalten, faelle } = planung
  return (
    <>
      <button
        className="admin-btn admin-btn-secondary"
        onClick={umschalten}
        aria-pressed={zeigen}
        title="Fenster, die Kunden zur Wahl angeboten wurden (noch keine Termine), gestrichelt anzeigen"
      >
        Reservationen {zeigen ? 'ausblenden' : 'zeigen'}{reservationen.length ? ` (${reservationen.length})` : ''}
      </button>
      {faelle.length > 0 && (
        <details className="terminwahl-faelle" style={{ position: 'relative' }}>
          <summary className="admin-btn admin-btn-secondary" style={{ listStyle: 'none', cursor: 'pointer' }}>
            {faelle.length === 1 ? '1 Terminanfrage ohne Antwort' : `${faelle.length} Terminanfragen ohne Antwort`}
          </summary>
          <ul className="admin-table-wrap"
              style={{ position: 'absolute', zIndex: 20, margin: '4px 0 0', padding: 12, listStyle: 'none',
                       minWidth: 280, right: 0 }}>
            {faelle.map(f => (
              <li key={f.anfrage_id} style={{ padding: '6px 0', fontSize: 13 }}>
                <button type="button" className="admin-link-btn"
                        style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer',
                                 color: 'var(--primary)', textAlign: 'left' }}
                        onClick={() => onOpenProject?.(f.project_id)} disabled={!onOpenProject}>
                  <strong>{projektName(f.project_id)}</strong>
                </button>
                <div style={{ color: 'var(--muted)' }}>{f.titel}</div>
                {f.hinweis_kunde && <div>Hinweis: {f.hinweis_kunde}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
