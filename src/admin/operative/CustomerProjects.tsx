import { useEffect, useState } from 'react'
import { getCustomerProjects } from '../../api/admin/customers'
import type { CustomerProject } from '../../api/admin/customers'
import { fmtDate } from '../utils/format'

// Projekte auf der Kundenstammseite (Feature-Anfrage WF-3).
//
// Vorher hiess «hat der Kunde schon ein Projekt?»: Kundenstamm verlassen,
// Projekte öffnen, Namen ins Suchfeld tippen — und bei zwei gleichnamigen
// Kunden raten, welcher Treffer wem gehört. Die Liste hängt deshalb an der
// `customer_id`, nicht am Namen.
//
// Jede Zeile ist ein echter Link auf `#/admin/projects/<id>`: ein normaler
// Klick springt in der App, Ctrl-/Cmd-Klick öffnet das Projekt in einem neuen
// Tab (der Kaltstart liest denselben Hash, shared/deepLink.ts).

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  offen: { label: 'Offen', cls: 'admin-badge-open' },
  abgeschlossen: { label: 'Abgeschlossen', cls: 'admin-badge-closed' },
  archiviert: { label: 'Archiviert', cls: 'admin-badge-draft' },
}

/** Offene Projekte zuerst, innerhalb davon die Server-Reihenfolge (jüngste zuerst). */
export function sortCustomerProjects(rows: CustomerProject[]): CustomerProject[] {
  const rank = (p: CustomerProject) => (p.status === 'offen' ? 0 : p.status === 'abgeschlossen' ? 1 : 2)
  return rows
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(x => x.p)
}

function isPlainClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

export function CustomerProjects({
  customerId,
  onOpenProject,
}: {
  customerId: string
  onOpenProject?: (projectId: string) => void
}) {
  const [rows, setRows] = useState<CustomerProject[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setFailed(false)
    getCustomerProjects(customerId)
      .then(r => { if (!cancelled) setRows(sortCustomerProjects(r)) })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true) } })
    return () => { cancelled = true }
  }, [customerId])

  const openCount = rows?.filter(p => p.status === 'offen').length ?? 0

  return (
    <div className="admin-form-group" style={{ marginTop: 14 }} data-testid="customer-projects">
      <div className="admin-form-label" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        Projekte
        {rows && rows.length > 0 && (
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
            {rows.length} {rows.length === 1 ? 'Projekt' : 'Projekte'}
            {openCount > 0 && `, davon ${openCount} offen`}
          </span>
        )}
      </div>
      {rows === null ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Laden…</div>
      ) : failed ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>Projekte konnten nicht geladen werden.</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Für diesen Kunden gibt es noch kein Projekt.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map(p => {
            const status = STATUS_LABEL[p.status] ?? { label: p.status, cls: 'admin-badge-draft' }
            const where = p.object_name || p.object_address
            return (
              <li key={p.id}>
                <a
                  href={`#/admin/projects/${encodeURIComponent(p.id)}`}
                  onClick={e => {
                    if (!onOpenProject || !isPlainClick(e)) return
                    e.preventDefault()
                    onOpenProject(p.id)
                  }}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
                    padding: '6px 10px', borderRadius: 6, background: 'var(--surface-2)',
                    color: 'inherit', textDecoration: 'none', fontSize: 13,
                  }}
                >
                  {p.project_id_text && (
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>
                      {p.project_id_text}
                    </span>
                  )}
                  <span style={{ fontWeight: 500, color: 'var(--primary)' }}>{p.name}</span>
                  {where && <span style={{ color: 'var(--muted)' }}>{where}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--muted)' }}>{fmtDate(p.created_at)}</span>
                    <span className={`admin-badge ${status.cls}`}>{status.label}</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
