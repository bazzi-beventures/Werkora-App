import { useCallback, useEffect, useState } from 'react'
import {
  fetchSupportDashboard,
  fetchSupportTicket,
  fetchSupportTickets,
  updateSupportTicket,
  type SupportDashboard,
  type SupportStatus,
  type SupportTicket,
  type SupportTicketDetail,
} from '../../api/support'
import { backdropCloseProps } from '../../shared/backdropClose'
import BiBarChart from '../kpis/components/BiBarChart'
import HorizontalBarChart from '../kpis/components/HorizontalBarChart'
import KpiCards from '../kpis/components/KpiCards'
import { ToastHost, useToast } from '../components/useToast'
import '../kpis/kpi-dashboard.css'
import './error-logs.css'
import './support.css'

/**
 * Support-Eingang mit Dashboard — Spec docs/specs/support-ticket.md §7.5/§7.6.
 *
 * Dashboard und Liste sitzen bewusst auf EINEM Screen (Spec E15): man sieht
 * «7 offen» und will genau die sehen. Die Kennzahl-Kacheln sind deshalb
 * gleichzeitig Filter.
 */

const STATUS_LABEL: Record<SupportStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
}

const STATUS_ORDER: SupportStatus[] = ['offen', 'in_arbeit', 'erledigt']

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit',
                                 hour: '2-digit', minute: '2-digit' })
}

function trendLabel(now: number, prev: number): string {
  if (prev === 0) return now === 0 ? 'wie Vorwoche' : `+${now} vs. Vorwoche`
  const diff = now - prev
  if (diff === 0) return 'wie Vorwoche'
  return `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} vs. Vorwoche`
}

// ── Detail-Dialog ───────────────────────────────────────────────────────────

interface DetailProps {
  ticket: SupportTicketDetail
  onClose: () => void
  onChanged: () => void
}

function TicketDetail({ ticket, onClose, onChanged }: DetailProps) {
  const [note, setNote] = useState(ticket.superadmin_note ?? '')
  const [busy, setBusy] = useState(false)
  const { toast, showToast } = useToast()
  const snapshot = ticket.snapshot ?? {}
  const crumbs = snapshot.client?.breadcrumbs ?? []

  async function apply(status?: SupportStatus) {
    setBusy(true)
    try {
      await updateSupportTicket(ticket.id, {
        ...(status ? { status } : {}),
        superadmin_note: note,
      })
      onChanged()
      onClose()
    } catch {
      showToast('Änderung fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <ToastHost toast={toast} />
      <div className="admin-modal elog-detail" onClick={e => e.stopPropagation()}
           role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title elog-detail-title">
            {ticket.reference} — {ticket.tenant_name || ticket.tenant_id}
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>

        <div className="admin-modal-body">
          <dl className="elog-meta-grid">
            <dt>Gemeldet</dt><dd>{fmtDateTime(ticket.created_at)}</dd>
            <dt>Von</dt><dd>{ticket.created_by_name || '—'} ({ticket.created_by_role || '—'})</dd>
            <dt>Bereich</dt><dd>{ticket.app_context === 'admin' ? 'Admin' : 'Mitarbeiter-App'}</dd>
            <dt>Screen</dt><dd>{ticket.route || '—'}</dd>
            <dt>Status</dt><dd>{STATUS_LABEL[ticket.status]}</dd>
            <dt>Erledigt</dt><dd>{fmtDateTime(ticket.closed_at)}</dd>
          </dl>

          <div>
            <div className="elog-detail-label">Meldung</div>
            <div className="elog-detail-message">{ticket.message}</div>
          </div>

          {ticket.attachments?.length > 0 && (
            <div>
              <div className="elog-detail-label">Screenshots</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ticket.attachments.map(att => (
                  att.url
                    ? <a key={att.path} href={att.url} target="_blank" rel="noreferrer">
                        <img src={att.url} alt="Screenshot zur Meldung"
                             style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8,
                                      border: '1px solid var(--border, #e5e7eb)' }} />
                      </a>
                    // HEIC von iPhones zeigt nicht jeder Browser an — dann bleibt
                    // der Download, statt ein kaputtes Bild zu behaupten.
                    : <span key={att.path} style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                        {att.path.split('/').pop()} (nicht anzeigbar)
                      </span>
                ))}
              </div>
            </div>
          )}

          {snapshot.partial && snapshot.partial.length > 0 && (
            <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--warning, #f59e0b)' }}>
              Teil-Snapshot: {snapshot.partial.join(', ')} war beim Absenden nicht
              erreichbar. Fehlende Zeilen bedeuten hier <b>nicht</b>, dass nichts passiert ist.
            </div>
          )}

          {crumbs.length > 0 && (
            <div>
              <div className="elog-detail-label">
                Was der Nutzer getan hat (letzte Schritte)
              </div>
              <pre className="elog-pre">{crumbs.map(c => `${c.t}  ${c.kind.padEnd(9)} ${c.detail}`).join('\n')}</pre>
            </div>
          )}

          {(snapshot.errors?.length ?? 0) > 0 && (
            <div>
              <div className="elog-detail-label">Backend-Fehler im Fenster</div>
              <pre className="elog-pre">{snapshot.errors!.map(
                e => `${fmtDateTime(e.occurred_at)}  ${e.level.toUpperCase()}  ${e.source}  ${e.message}`,
              ).join('\n')}</pre>
            </div>
          )}

          {(snapshot.audit?.length ?? 0) > 0 && (
            <div>
              <div className="elog-detail-label">Aktivität im Mandanten</div>
              <pre className="elog-pre">{snapshot.audit!.map(
                a => `${fmtDateTime(a.created_at)}  ${a.action}  ${a.entity}  ${a.performed_by}`,
              ).join('\n')}</pre>
            </div>
          )}

          {(snapshot.health?.length ?? 0) > 0 && (
            <div>
              <div className="elog-detail-label">Infrastruktur</div>
              <pre className="elog-pre">{snapshot.health!.map(
                h => `${fmtDateTime(h.checked_at)}  ${h.service}  ${h.status}  ${h.response_ms ?? '—'} ms`,
              ).join('\n')}</pre>
            </div>
          )}

          {snapshot.client && (
            <dl className="elog-meta-grid">
              <dt>Gerät</dt><dd>{snapshot.client.user_agent || '—'}</dd>
              <dt>Viewport</dt><dd>{snapshot.client.viewport || '—'}</dd>
              <dt>Online</dt><dd>{snapshot.client.online === false ? 'nein' : 'ja'}</dd>
            </dl>
          )}

          <label className="elog-field elog-field--grow">
            <span>Notiz</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
                   placeholder="Interne Notiz zur Meldung …" />
          </label>
        </div>

        <div className="admin-modal-footer">
          {STATUS_ORDER.filter(s => s !== ticket.status).map(s => (
            <button key={s} className="admin-btn admin-btn-secondary admin-btn-sm"
                    disabled={busy} onClick={() => apply(s)}>
              → {STATUS_LABEL[s]}
            </button>
          ))}
          <button className="admin-btn admin-btn-primary admin-btn-sm"
                  disabled={busy} onClick={() => apply()}>
            Notiz speichern
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function SupportTicketsScreen() {
  const [dashboard, setDashboard] = useState<SupportDashboard | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [statusFilter, setStatusFilter] = useState<SupportStatus | ''>('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null)
  const { toast, showToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dash, list] = await Promise.all([
        fetchSupportDashboard(),
        fetchSupportTickets({ status: statusFilter || undefined, tenantId: tenantFilter || undefined }),
      ])
      setDashboard(dash)
      setTickets(list.tickets)
      setTenants(list.tenants)
    } catch {
      showToast('Support-Daten konnten nicht geladen werden', 'error')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, tenantFilter, showToast])

  useEffect(() => { load() }, [load])

  async function openDetail(id: string) {
    try {
      setDetail(await fetchSupportTicket(id))
    } catch {
      showToast('Meldung konnte nicht geladen werden', 'error')
    }
  }

  const cards = dashboard ? [
    {
      label: 'Offen / in Arbeit',
      value: String(dashboard.open_total),
      // Aufschlüsselung statt leerer Zeile: ohne `sub` steht diese Kachel als
      // einzige ohne Fusszeile in der Reihe und wirkt unfertig neben den drei
      // anderen. Die Zahl ist ohnehin die Summe der beiden Werte.
      sub: `${dashboard.counts?.offen ?? 0} offen · ${dashboard.counts?.in_arbeit ?? 0} in Arbeit`,
    },
    {
      label: 'Neu (7 Tage)',
      value: String(dashboard.new_7d),
      sub: trendLabel(dashboard.new_7d, dashboard.new_prev_7d),
    },
    {
      label: 'Median bis erledigt',
      value: dashboard.median_hours_30d === null ? '—' : `${dashboard.median_hours_30d} h`,
      sub: '30 Tage',
    },
    {
      label: 'Mit Backend-Fehler',
      value: dashboard.error_share_30d === null
        ? '—'
        : `${Math.round(dashboard.error_share_30d * 100)} %`,
      // Die inhaltlich wertvollste Zahl: sie trennt echte Defekte von
      // Bedien- und Verständnisfragen.
      sub: `${dashboard.total_30d} Meldungen (30 Tage)`,
    },
  ] : []

  return (
    <div className="admin-page">
      <ToastHost toast={toast} />
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Support-Meldungen</div>
          <div className="admin-page-subtitle">
            Meldungen aus der Hilfe-Blase, über alle Mandanten. Aufbewahrung 90 Tage.
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={load} disabled={loading}>
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {dashboard && <KpiCards cards={cards} columns={4} />}

      {/* Kacheln als Filter (Spec E15): ein Klick auf einen Status filtert die
          Liste darunter, statt auf einen zweiten Screen zu springen. */}
      <div className="support-filterbar">
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            className={`elog-chip${statusFilter === s ? ' active' : ''}`}
            aria-pressed={statusFilter === s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
          >
            {STATUS_LABEL[s]}
            <span className="elog-chip-count">{dashboard?.counts?.[s] ?? 0}</span>
          </button>
        ))}
        <label className="support-filter-tenant">
          <span>Mandant</span>
          <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
            <option value="">Alle Mandanten</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>

      {dashboard && dashboard.by_week.length > 1 && (
        <div className="kpi-bi-section">
          <div className="kpi-bi-section-title">Meldungen je Woche</div>
          <BiBarChart
            data={dashboard.by_week as unknown as Record<string, unknown>[]}
            xKey="week"
            bars={[{ dataKey: 'count', label: 'Meldungen', color: '#3180ab' }]}
            xInterval="preserveStartEnd"
          />
        </div>
      )}

      {dashboard && dashboard.by_route.length > 0 && (
        <div className="kpi-bi-section">
          <div className="kpi-bi-section-title">Wo es klemmt (Top-Screens)</div>
          <HorizontalBarChart
            data={dashboard.by_route as unknown as Record<string, unknown>[]}
            yKey="key" dataKey="count" color="#3180ab"
          />
        </div>
      )}

      {dashboard && dashboard.by_tenant.length > 1 && (
        <div className="kpi-bi-section">
          <div className="kpi-bi-section-title">Nach Mandant</div>
          <HorizontalBarChart
            data={dashboard.by_tenant.map(t => ({ key: t.name ?? t.key, count: t.count }))}
            yKey="key" dataKey="count" color="#7c8fa3"
          />
        </div>
      )}

      <div className="kpi-bi-section">
        <div className="kpi-bi-section-title">Eingang</div>
        {tickets.length === 0 && !loading && (
          <div className="support-empty">
            {statusFilter || tenantFilter
              ? 'Keine Meldungen für diese Auswahl.'
              : 'Keine Meldungen im Zeitraum.'}
          </div>
        )}
        {tickets.length > 0 && (
          <div className="elog-list" role="list">
            {tickets.map(t => (
              <button
                key={t.id}
                role="listitem"
                className="elog-row"
                onClick={() => openDetail(t.id)}
                title="Meldung öffnen"
              >
                <span className="elog-cell-time">{fmtDateTime(t.created_at)}</span>
                <span className="elog-cell-source">
                  {t.reference}
                  {t.snapshot_error_count > 0 && (
                    <span className="elog-type"> · {t.snapshot_error_count} Fehler</span>
                  )}
                </span>
                <span className="elog-cell-msg">{t.message}</span>
                <span className="elog-cell-tenant">
                  {t.tenant_name ?? 'Plattform'} · {STATUS_LABEL[t.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <TicketDetail ticket={detail} onClose={() => setDetail(null)} onChanged={load} />
      )}
    </div>
  )
}
