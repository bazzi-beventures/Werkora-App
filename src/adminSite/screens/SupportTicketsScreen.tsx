import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  fetchSupportDashboard,
  fetchSupportTicket,
  fetchSupportTickets,
  sendSupportReply,
  updateSupportTicket,
  type SupportCluster,
  type SupportDashboard,
  type SupportReply,
  type SupportStatus,
  type SupportTicket,
  type SupportTicketDetail,
} from '../../api/support'
import { supportTicketToFeatureRequest } from '../../api/featureRequests'
import HorizontalBarChart from '../../admin/components/HorizontalBarChart'
import { useChartTheme } from '../../admin/components/useChartTheme'
import { ToastHost, useToast } from '../../admin/components/useToast'
import {
  TAB_LABEL,
  ageLabel,
  ageTone,
  inboxView,
  isUnread,
  routeLabel,
  routeLabelAny,
  tabCounts,
  type InboxTab,
} from './supportInbox'
import '../../admin/kpis/kpi-dashboard.css'
import './error-logs.css'
import './support.css'

/**
 * Support-Posteingang — Spec docs/specs/support-uebersicht.md.
 *
 * Posteingang zuerst, Auswertung auf Knopfdruck. Beim Öffnen steht da, was zu
 * tun ist (offen + in Arbeit, älteste zuerst), und sonst nichts. Das Detail ist
 * ein Bereich neben der Liste statt eines Modals: mehrere Meldungen
 * hintereinander abarbeiten heisst dann nur noch «nächste Zeile anklicken».
 */

const STATUS_LABEL: Record<SupportStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
}

const STATUS_ORDER: SupportStatus[] = ['offen', 'in_arbeit', 'erledigt']
const TABS: InboxTab[] = ['todo', 'erledigt', 'alle']

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit',
                                 hour: '2-digit', minute: '2-digit' })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

function trendLabel(now: number, prev: number): string {
  const diff = now - prev
  if (diff === 0) return ''
  return ` (${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} ggü. Vorwoche)`
}

function clusterLabel(c: SupportCluster): string {
  const was = c.kind === 'route' ? `von «${routeLabelAny(c.key)}»` : `mit Backend-Fehler in «${c.key}»`
  return `Häufung: ${c.count} offene Meldungen ${was} seit ${fmtTime(c.since)}`
}

// ── Detail ──────────────────────────────────────────────────────────────────

interface DetailProps {
  ticket: SupportTicketDetail
  now: number
  onBack: () => void
  onChanged: () => void
}

/** Vorschlagstext beim Abschliessen — abschicken muss ihn trotzdem ein Mensch
 *  (Spec docs/specs/support-antwort.md A3). */
const ERLEDIGT_VORSCHLAG = 'Das Problem ist behoben.'

/** Aufklappbarer Snapshot-Abschnitt mit Anzahl im Titel (Spec §3.3). */
function Section({ title, count, open, children }: {
  title: string; count?: number; open?: boolean; children: ReactNode
}) {
  return (
    <details className="support-section" open={open}>
      <summary>
        {title}
        {count !== undefined && <span className="elog-chip-count">{count}</span>}
      </summary>
      {children}
    </details>
  )
}

function TicketDetail({ ticket, now, onBack, onChanged }: DetailProps) {
  const [note, setNote] = useState(ticket.superadmin_note ?? '')
  // Lokal mitgeführt: nach dem Statuswechsel bleibt das Detail offen, und die
  // Knöpfe sollen den neuen Stand anbieten, nicht den geladenen.
  const [status, setStatus] = useState<SupportStatus>(ticket.status)
  const [reply, setReply] = useState('')
  const [replies, setReplies] = useState<SupportReply[]>(ticket.replies ?? [])
  // Lokal mitgeführt: eine neue Antwort LEERT die Quittung serverseitig
  // (docs/specs/support-antwort.md §6.1). Läse die Anzeige weiter aus dem
  // geladenen Ticket, stünde «gelesen am …» unter einer Antwort, die der Melder
  // noch gar nicht gesehen haben kann.
  const [readAt, setReadAt] = useState<string | null>(ticket.reply_read_at ?? null)
  const [busy, setBusy] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement | null>(null)
  const { toast, showToast } = useToast()
  const snapshot = ticket.snapshot ?? {}
  const crumbs = snapshot.client?.breadcrumbs ?? []
  const errors = snapshot.errors ?? []
  const audit = snapshot.audit ?? []
  const health = snapshot.health ?? []

  async function apply(next?: SupportStatus) {
    setBusy(true)
    try {
      await updateSupportTicket(ticket.id, {
        ...(next ? { status: next } : {}),
        superadmin_note: note,
      })
      if (next) setStatus(next)
      onChanged()
      // Abschliessen OHNE zu benachrichtigen (Spec A3): der Statuswechsel
      // verschickt bewusst nichts, er füllt nur das Antwortfeld vor. Ein
      // automatisches «Ihre Meldung ist erledigt» ohne Hintergrund ist bei
      // einer Doppelmeldung oder Bedienfrage nutzlos bis ärgerlich.
      if (next === 'erledigt') {
        setReply(current => current.trim() || ERLEDIGT_VORSCHLAG)
        replyRef.current?.focus()
      } else if (!next) {
        showToast('Notiz gespeichert', 'success')
      }
    } catch {
      showToast('Änderung fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Weiche Support → Wunsch (docs/specs/feature-anfragen.md §7.3).
   *
   * Legt eine Feature-Anfrage mit Person und Datum der Meldung an und schliesst
   * die Meldung mit interner Notiz. Dem Melder geht dabei NICHTS zu — wie beim
   * Abschliessen (A3) wird nur das Antwortfeld vorbelegt.
   */
  async function toFeatureRequest() {
    setBusy(true)
    try {
      const res = await supportTicketToFeatureRequest(ticket.id)
      setStatus('erledigt')
      setNote(prev => prev.trim() ? `${prev.trim()} · → ${res.reference}` : `→ ${res.reference}`)
      setReply(current => current.trim() || res.reply_suggestion)
      replyRef.current?.focus()
      showToast(`Als Wunsch ${res.reference} aufgenommen`, 'success')
      onChanged()
    } catch {
      showToast('Übernahme als Wunsch fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function sendReply() {
    const text = reply.trim()
    if (!text) return
    setBusy(true)
    try {
      const res = await sendSupportReply(ticket.id, text)
      setReplies(res.replies ?? [])
      setReadAt(null)
      setReply('')
      showToast('Antwort gesendet', 'success')
      onChanged()
    } catch {
      showToast('Antwort konnte nicht gesendet werden', 'error')
    } finally {
      setBusy(false)
    }
  }

  const tone = ageTone({ status, created_at: ticket.created_at }, now)

  return (
    <article className="support-detail" aria-label={`Meldung ${ticket.reference}`}>
      <ToastHost toast={toast} />
      <button type="button" className="support-back admin-btn admin-btn-secondary admin-btn-sm"
              onClick={onBack}>
        ← Eingang
      </button>

      <header className="support-detail-head">
        <div className="support-detail-title">
          {ticket.reference} · {ticket.tenant_name || ticket.tenant_id}
        </div>
        <div className="support-detail-meta">
          <span className={`support-status support-status--${status}`}>{STATUS_LABEL[status]}</span>
          {' · '}
          <span className={`support-age support-age--${tone}`}>
            {status === 'erledigt'
              ? `erledigt ${fmtDateTime(ticket.closed_at)}`
              : `seit ${ageLabel(ticket.created_at, now)}`}
          </span>
          {' · '}
          {ticket.created_by_name || '—'}{ticket.created_by_role ? ` (${ticket.created_by_role})` : ''}
        </div>
        <div className="support-detail-meta">
          {routeLabel(ticket.route, ticket.app_context)}
          {' · '}
          {ticket.app_context === 'admin' ? 'Admin' : 'Mitarbeiter-App'}
          {' · gemeldet '}
          {fmtDateTime(ticket.created_at)}
        </div>
      </header>

      <div className="elog-detail-message">{ticket.message}</div>

      {ticket.attachments?.length > 0 && (
        <div className="support-shots">
          {ticket.attachments.map(att => (
            att.url
              ? <a key={att.path} href={att.url} target="_blank" rel="noreferrer">
                  <img src={att.url} alt="Screenshot zur Meldung" className="support-shot" />
                </a>
              // HEIC von iPhones zeigt nicht jeder Browser an — dann bleibt
              // der Dateiname, statt ein kaputtes Bild zu behaupten.
              : <span key={att.path} className="support-shot-missing">
                  {att.path.split('/').pop()} (nicht anzeigbar)
                </span>
          ))}
        </div>
      )}

      {snapshot.partial && snapshot.partial.length > 0 && (
        <div role="alert" className="support-partial">
          Teil-Snapshot: {snapshot.partial.join(', ')} war beim Absenden nicht
          erreichbar. Fehlende Zeilen bedeuten hier <b>nicht</b>, dass nichts passiert ist.
        </div>
      )}

      <div className="support-sections">
        {errors.length > 0 && (
          // Als einziger Abschnitt aufgeklappt: er trennt den Defekt von der
          // Bedienfrage, und das ist die erste Frage an jede Meldung.
          <Section title="Backend-Fehler im Fenster" count={errors.length} open>
            <pre className="elog-pre">{errors.map(
              e => `${fmtDateTime(e.occurred_at)}  ${e.level.toUpperCase()}  ${e.source}  ${e.message}`,
            ).join('\n')}</pre>
          </Section>
        )}
        {crumbs.length > 0 && (
          <Section title="Was der Nutzer getan hat (letzte Schritte)" count={crumbs.length}>
            <pre className="elog-pre">{crumbs.map(c => `${c.t}  ${c.kind.padEnd(9)} ${c.detail}`).join('\n')}</pre>
          </Section>
        )}
        {audit.length > 0 && (
          <Section title="Aktivität im Mandanten" count={audit.length}>
            <pre className="elog-pre">{audit.map(
              a => `${fmtDateTime(a.created_at)}  ${a.action}  ${a.entity}  ${a.performed_by}`,
            ).join('\n')}</pre>
          </Section>
        )}
        {health.length > 0 && (
          <Section title="Infrastruktur" count={health.length}>
            <pre className="elog-pre">{health.map(
              h => `${fmtDateTime(h.checked_at)}  ${h.service}  ${h.status}  ${h.response_ms ?? '—'} ms`,
            ).join('\n')}</pre>
          </Section>
        )}
        {snapshot.client && (
          <Section title="Gerät">
            <dl className="elog-meta-grid">
              <dt>Gerät</dt><dd>{snapshot.client.user_agent || '—'}</dd>
              <dt>Viewport</dt><dd>{snapshot.client.viewport || '—'}</dd>
              <dt>Online</dt><dd>{snapshot.client.online === false ? 'nein' : 'ja'}</dd>
            </dl>
          </Section>
        )}
      </div>

      {/* Antwort an den MELDER — Spec docs/specs/support-antwort.md §5.
          Steht bewusst direkt über der internen Notiz und ist beschriftet
          wie das, was sie ist: die Beschriftung ist die einzige Sicherung
          dagegen, dass eine interne Bemerkung beim Monteur landet. */}
      <div className="support-reply">
        <div className="elog-detail-label">Antwort an den Melder</div>

        {replies.length > 0 && (
          <div className="support-reply-list">
            {replies.map((r, index) => (
              <div key={`${r.at}-${index}`} className="support-reply-item">
                <div className="support-reply-meta">
                  {fmtDateTime(r.at)}{r.by ? ` · ${r.by}` : ''}
                  {index === replies.length - 1 && (
                    readAt
                      ? ` · gelesen am ${fmtDateTime(readAt)}`
                      : ' · noch nicht gelesen'
                  )}
                </div>
                <div className="support-reply-text">{r.text}</div>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={replyRef}
          value={reply}
          onChange={e => setReply(e.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="Was der Melder lesen soll — was war los, was ist jetzt anders …"
          className="support-reply-input"
        />
        <div className="support-reply-actions">
          <button className="admin-btn admin-btn-primary admin-btn-sm"
                  disabled={busy || !reply.trim()} onClick={sendReply}>
            Antwort senden
          </button>
          <span className="support-reply-hint">
            Geht als Push an den Melder und steht in seiner App unter
            «Meine Meldungen».
          </span>
        </div>
      </div>

      <label className="elog-field elog-field--grow">
        <span>Notiz (intern)</span>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
               placeholder="Interne Notiz — der Melder sieht sie nicht" />
      </label>

      <div className="support-detail-actions">
        {/* Kein Problem, sondern ein Wunsch? Dann gehört es in den Wunsch-Pool
            (docs/specs/feature-anfragen.md §7.3) — dort bekommt es eine Phase
            statt eines Status. */}
        <button className="admin-btn admin-btn-secondary admin-btn-sm"
                disabled={busy || status === 'erledigt'} onClick={toFeatureRequest}
                title="Als Feature-Anfrage übernehmen und die Meldung schliessen">
          Ist ein Wunsch
        </button>
        {STATUS_ORDER.filter(s => s !== status).map(s => (
          <button key={s} className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={busy} onClick={() => apply(s)}>
            → {STATUS_LABEL[s]}
          </button>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm"
                disabled={busy} onClick={() => apply()}>
          Notiz speichern
        </button>
      </div>
    </article>
  )
}

// ── Listenzeile ─────────────────────────────────────────────────────────────

function TicketRow({ ticket: t, now, selected, onOpen }: {
  ticket: SupportTicket; now: number; selected: boolean; onOpen: () => void
}) {
  const unread = isUnread(t)
  const replyMark = t.last_reply_at
    ? (t.reply_read_at && t.reply_read_at >= t.last_reply_at ? '↩ gelesen' : '↩ beantwortet')
    : null
  return (
    <button
      type="button"
      role="listitem"
      className={`support-row${selected ? ' is-selected' : ''}${unread ? ' is-unread' : ''}`}
      aria-current={selected || undefined}
      onClick={onOpen}
      title="Meldung öffnen"
    >
      <span className="support-row-line1">
        <span className={`support-dot${unread ? ' is-unread' : ''}`}
              aria-label={unread ? 'ungelesen' : undefined} />
        <span className="support-row-ref">{t.reference}</span>
        <span className={`support-age support-age--${ageTone(t, now)}`}>{ageLabel(t.created_at, now)}</span>
        <span className="support-row-tenant">{t.tenant_name ?? 'Plattform'}</span>
      </span>
      <span className="support-row-line2">
        {t.created_by_name || '—'} · {routeLabel(t.route, t.app_context)}
        {t.status === 'in_arbeit' && ' · in Arbeit'}
      </span>
      <span className="support-row-msg">{t.message}</span>
      {(t.attachment_count > 0 || t.snapshot_error_count > 0 || replyMark) && (
        <span className="support-row-marks">
          {t.attachment_count > 0 && <span className="support-mark">📎 {t.attachment_count}</span>}
          {t.snapshot_error_count > 0 && (
            <span className="support-mark support-mark--error">⚠ {t.snapshot_error_count} Fehler</span>
          )}
          {replyMark && <span className="support-mark">{replyMark}</span>}
        </span>
      )}
    </button>
  )
}

// ── Auswertung ──────────────────────────────────────────────────────────────

/** Gestapelte Säulen «mit / ohne Backend-Fehler». Die Stapelung beantwortet die
 *  Frage, die eine reine Zählung offenlässt: kaputter Code oder fehlende Doku
 *  (Spec §4). Zählachsen ganzzahlig — «0.25 Meldungen» gibt es nicht. */
function ErrorSplitChart({ data, vertical }: {
  data: { label: string; mit: number; ohne: number }[]; vertical?: boolean
}) {
  const t = useChartTheme()
  const tooltip = {
    contentStyle: {
      background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`,
      borderRadius: 'var(--radius-sm)', color: t.tooltipText, fontSize: 12,
    },
  }
  const height = vertical ? Math.max(120, data.length * 36 + 60) : 220
  return (
    <div className="kpi-bi-chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={vertical ? 'vertical' : 'horizontal'}
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid}
                         vertical={!!vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={{ fill: t.tickMuted, fontSize: 11 }}
                     axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={130}
                     tick={{ fill: t.tickStrong, fontSize: 12 }} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={{ fill: t.tickMuted, fontSize: 11 }}
                     axisLine={{ stroke: t.axis }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: t.tickMuted, fontSize: 11 }}
                     axisLine={false} tickLine={false} width={28} />
            </>
          )}
          <Tooltip {...tooltip} />
          <Legend wrapperStyle={{ fontSize: 11, color: t.tickMuted }} />
          <Bar dataKey="mit" name="mit Backend-Fehler" stackId="s" fill={t.series[7]} />
          <Bar dataKey="ohne" name="ohne Fehler" stackId="s" fill={t.series[0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Unter diesen Schwellen sagt ein Block nichts aus und bleibt weg (Spec §4). */
const MIN_ROUTE_TICKETS = 5

function Analysis({ dashboard, onClose }: { dashboard: SupportDashboard; onClose: () => void }) {
  const chartTheme = useChartTheme()
  const weeks = dashboard.by_week.map(w => ({
    label: w.week.replace(/^\d{4}-/, ''),
    mit: w.with_errors ?? 0,
    ohne: w.count - (w.with_errors ?? 0),
  }))
  const routes = dashboard.by_route.map(r => ({
    label: routeLabelAny(r.key),
    mit: r.with_errors ?? 0,
    ohne: r.count - (r.with_errors ?? 0),
  }))
  const tenantsWithTickets = dashboard.by_tenant.filter(t => t.count > 0)
  const zuWenig = 'zu wenig Daten'

  return (
    <aside className="support-analysis" aria-label="Auswertung">
      <div className="support-analysis-head">
        <div className="kpi-bi-section-title">Auswertung ({dashboard.window_days} Tage)</div>
        <button type="button" className="admin-modal-close" onClick={onClose}
                aria-label="Auswertung schliessen">×</button>
      </div>

      <dl className="support-figures">
        <dt>Median bis erledigt (30 T)</dt>
        <dd>{dashboard.median_hours_30d === null ? zuWenig : `${dashboard.median_hours_30d} h`}</dd>
        <dt>Anteil mit Backend-Fehler (30 T)</dt>
        <dd>{dashboard.error_share_30d === null
          ? zuWenig
          : `${Math.round(dashboard.error_share_30d * 100)} %`}</dd>
        <dt>Meldungen (30 T)</dt>
        <dd>{dashboard.total_30d}</dd>
      </dl>

      {weeks.length >= 2 && (
        <section>
          <div className="support-analysis-title">Meldungen je Woche</div>
          <ErrorSplitChart data={weeks} />
        </section>
      )}

      {dashboard.total_30d >= MIN_ROUTE_TICKETS && routes.length > 0 && (
        <section>
          <div className="support-analysis-title">Wo es klemmt (Top-Screens)</div>
          <ErrorSplitChart data={routes} vertical />
        </section>
      )}

      {tenantsWithTickets.length >= 2 && (
        <section>
          <div className="support-analysis-title">Nach Mandant</div>
          <HorizontalBarChart
            data={tenantsWithTickets.map(t => ({ key: t.name ?? t.key, count: t.count }))}
            yKey="key" dataKey="count" color={chartTheme.series[1]}
          />
        </section>
      )}

      {dashboard.by_source.length > 0 && (
        <section>
          <div className="support-analysis-title">Backend-Stellen in Meldungen</div>
          <ul className="support-source-list">
            {dashboard.by_source.map(s => (
              <li key={s.key}><code>{s.key}</code><span>{s.count}</span></li>
            ))}
          </ul>
        </section>
      )}

      {weeks.length < 2 && dashboard.total_30d < MIN_ROUTE_TICKETS && (
        <p className="support-analysis-hint">
          Diagramme erscheinen, sobald es genug Meldungen gibt. Bei einer
          Handvoll zeigen sie nur Zufall.
        </p>
      )}
    </aside>
  )
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function SupportTicketsScreen({ initialTicketId }: { initialTicketId?: string } = {}) {
  const [dashboard, setDashboard] = useState<SupportDashboard | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [capped, setCapped] = useState(false)
  const [tab, setTab] = useState<InboxTab>('todo')
  const [tenantFilter, setTenantFilter] = useState('')
  const [query, setQuery] = useState('')
  const [cluster, setCluster] = useState<SupportCluster | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId ?? null)
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const { toast, showToast } = useToast()

  // Eine Ladung ohne Status-/Mandantenfilter: die Liste ist durch die
  // 90-Tage-Aufbewahrung klein, und so stimmen Reiter-Zahlen und Liste immer
  // überein. Gefiltert wird im Client (supportInbox.inboxView).
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dash, list] = await Promise.all([fetchSupportDashboard(), fetchSupportTickets()])
      setDashboard(dash)
      setTickets(list.tickets)
      setTenants(list.tenants)
      setCapped(list.capped)
      setNow(Date.now())
    } catch {
      showToast('Support-Daten konnten nicht geladen werden', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let aktiv = true
    fetchSupportTicket(selectedId)
      .then(d => {
        if (!aktiv) return
        setDetail(d)
        // Das Öffnen setzt serverseitig `seen_at` — der Punkt in der Liste
        // verschwindet sofort, nicht erst beim nächsten Laden.
        setTickets(ts => ts.map(t => (t.id === d.id ? { ...t, seen_at: d.seen_at ?? t.seen_at } : t)))
      })
      .catch(() => { if (aktiv) showToast('Meldung konnte nicht geladen werden', 'error') })
    return () => { aktiv = false }
  }, [selectedId, showToast])

  const view = useMemo(
    () => inboxView(tickets, { tab, tenantId: tenantFilter, query, cluster }),
    [tickets, tab, tenantFilter, query, cluster],
  )
  const counts = useMemo(() => tabCounts(tickets, tenantFilter), [tickets, tenantFilter])
  const clusters = dashboard?.clusters ?? []

  function pickCluster(c: SupportCluster) {
    setCluster(cur => (cur && cur.kind === c.kind && cur.key === c.key ? null : c))
    setTab('todo')
  }

  const statusLine = dashboard && (
    <div className="support-statusline">
      {dashboard.open_total === 0
        ? <b>Alles erledigt ✓</b>
        : <b>{dashboard.open_total} zu erledigen</b>}
      {dashboard.oldest_open_at && (
        <span className={`support-age support-age--${ageTone(
          { status: 'offen', created_at: dashboard.oldest_open_at }, now)}`}>
          {' · '}älteste wartet {ageLabel(dashboard.oldest_open_at, now)}
        </span>
      )}
      <span>
        {' · '}7 Tage: {dashboard.new_7d} neu{trendLabel(dashboard.new_7d, dashboard.new_prev_7d)}
      </span>
    </div>
  )

  const emptyText = cluster || query || tenantFilter
    ? 'Keine Meldungen für diese Auswahl.'
    : tab === 'todo'
      ? 'Nichts zu erledigen. Erledigte Meldungen stehen im Reiter «Erledigt».'
      : 'Keine Meldungen im Zeitraum.'

  return (
    <div className="admin-page support-page">
      <ToastHost toast={toast} />
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Support</div>
          {statusLine}
        </div>
        <div className="elog-header-actions">
          <button className={`admin-btn admin-btn-secondary${showAnalysis ? ' is-active' : ''}`}
                  aria-pressed={showAnalysis}
                  onClick={() => setShowAnalysis(v => !v)} disabled={!dashboard}>
            Auswertung
          </button>
          <button className="admin-btn admin-btn-secondary" onClick={load} disabled={loading}
                  aria-label="Aktualisieren" title="Aktualisieren">
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {clusters.length > 0 && (
        <div className="support-clusters" role="status">
          {clusters.map(c => {
            const aktiv = cluster?.kind === c.kind && cluster.key === c.key
            return (
              <button key={`${c.kind}:${c.key}`} type="button"
                      className={`support-cluster${aktiv ? ' is-active' : ''}`}
                      aria-pressed={aktiv} onClick={() => pickCluster(c)}>
                ⚠ {clusterLabel(c)}
                <span className="support-cluster-action">{aktiv ? 'Filter aufheben' : 'Anzeigen'}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className={`support-inbox${detail ? ' has-selection' : ''}${showAnalysis ? ' has-analysis' : ''}`}>
        <section className="support-list-pane" aria-label="Eingang">
          <div className="support-tabs" role="tablist">
            {TABS.map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t}
                      className={`elog-chip${tab === t ? ' active' : ''}`}
                      onClick={() => setTab(t)}>
                {TAB_LABEL[t]}
                <span className="elog-chip-count">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="support-list-filters">
            <select aria-label="Mandant" value={tenantFilter}
                    onChange={e => setTenantFilter(e.target.value)}>
              <option value="">Alle Mandanten</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input type="search" placeholder="Suche: WS-…, Text, Name" value={query}
                   aria-label="Meldungen durchsuchen"
                   onChange={e => setQuery(e.target.value)} />
          </div>
          {cluster && (
            <div className="support-filter-note">
              Gefiltert auf {cluster.kind === 'route' ? routeLabelAny(cluster.key) : cluster.key}
              {' · '}
              <button type="button" className="support-linkbtn" onClick={() => setCluster(null)}>
                aufheben
              </button>
            </div>
          )}

          {view.length === 0 && !loading && <div className="support-empty">{emptyText}</div>}
          {view.length > 0 && (
            <div className="support-list" role="list">
              {view.map(t => (
                <TicketRow key={t.id} ticket={t} now={now} selected={t.id === selectedId}
                           onOpen={() => setSelectedId(t.id)} />
              ))}
            </div>
          )}
          {capped && (
            <div className="support-filter-note">
              Nur die neuesten Meldungen geladen — ältere über den Mandanten-Filter eingrenzen.
            </div>
          )}
        </section>

        <section className="support-detail-pane">
          {detail
            ? <TicketDetail key={detail.id} ticket={detail} now={now}
                            onBack={() => setSelectedId(null)} onChanged={load} />
            : <div className="support-detail-empty">Links eine Meldung wählen.</div>}
        </section>

        {showAnalysis && dashboard && (
          <Analysis dashboard={dashboard} onClose={() => setShowAnalysis(false)} />
        )}
      </div>
    </div>
  )
}
