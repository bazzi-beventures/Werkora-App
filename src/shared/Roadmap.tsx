import { useCallback, useEffect, useMemo, useState } from 'react'
import { isNetworkError } from '../api/client'
import {
  AREA_LABEL,
  BOARD_PHASES,
  END_PHASES,
  IMPORTANCE_LABEL,
  PHASE_LABEL,
  fetchRoadmap,
  fetchRoadmapFeature,
  fetchTenantWishes,
  fmtDay,
  formatTarget,
  sinceLabel,
  subscribeFeature,
  supportFeatureWish,
  unsubscribeFeature,
  withdrawFeatureSupport,
  type BoardCard,
  type HistoryEntry,
  type MyWish,
  type Phase,
  type PublicFeatureDetail,
} from '../api/featureRequests'
import MyWishes from './MyWishes'
import { useMyWishes } from './useMyWishes'
import { useOnline } from './useOnline'
import './wishes.css'

/**
 * Roadmap für Nutzer — Spec docs/specs/feature-anfragen.md §5.4/§5.5.
 *
 * Läuft in beiden Apps; der Rahmen (Kopfzeile, Zurück) gehört dem Aufrufer.
 * Nutzer LESEN hier nur: kein Drag & Drop, keine Phase. Was sie tun können:
 * liken (= unterstützen, «Brauchen wir auch»), abonnieren, zurückziehen,
 * ihre Wünsche sehen (§5.9).
 *
 * «Neu seit letztem Besuch» merkt sich der Browser (`roadmap-seen:<userId>`) —
 * eine Komfortfunktion: fehlt der Wert oder ist der Speicher gesperrt, gibt es
 * eben keinen Punkt.
 */

const SEEN_KEY = (userId: string) => `roadmap-seen:${userId}`

function loadSeen(userId: string): string | null {
  try { return localStorage.getItem(SEEN_KEY(userId)) } catch { return null }
}

function storeSeen(userId: string, iso: string) {
  try { localStorage.setItem(SEEN_KEY(userId), iso) } catch { /* gesperrt → kein Punkt */ }
}

function historyLine(e: HistoryEntry): string {
  if (e.art === 'phase') return PHASE_LABEL[e.phase!] ?? String(e.phase)
  if (e.art === 'ziel') {
    const von = e.from ? formatTarget(e.from.from, e.from.to, e.from.precision) : 'ohne Termin'
    const nach = e.to ? formatTarget(e.to.from, e.to.to, e.to.precision) : 'ohne Termin'
    return `Ziel verschoben: ${von} → ${nach}`
  }
  return 'Zwischenstand'
}

function demandLine(c: BoardCard): string {
  const parts: string[] = []
  if (c.own_count > 0) parts.push(`Ihr (${c.own_count})`)
  if (c.other_tenants > 0) {
    parts.push(`${c.own_count > 0 ? '+ ' : ''}${c.other_tenants} ${c.other_tenants === 1 ? 'weiterer Betrieb' : 'weitere Betriebe'}`)
  }
  return parts.join(' ') || 'noch niemand'
}

// ── Like & Abo (Spec §5.9) ──────────────────────────────────────────────────

/**
 * Like und Abo — auf der Karte kompakt, im Detail ausgeschrieben.
 *
 * Der Like IST die Unterstützung (F6): er zählt als Nachfrage, abonniert aber
 * nicht. Das Abo bringt die Push bei jedem Phasenwechsel, ohne Nachfrage zu
 * sein. Wer selbst angefragt hat, hat beides schon — beide Knöpfe stehen dann
 * gedrückt und gesperrt da, statt zu verschwinden.
 */
function Reactions({ card, appContext, variant, likeText = '', onChanged, onLiked }: {
  card: BoardCard
  appContext: 'pwa' | 'admin'
  variant: 'card' | 'sheet'
  likeText?: string
  onChanged: () => void
  /** Nach einem gelungenen Like — das Detail leert dort sein «wofür»-Feld. */
  onLiked?: () => void
}) {
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const ownRequest = card.mine === 'anfrage'
  const liked = card.mine === 'unterstuetzung'
  const subscribed = !!card.subscribed || !!card.notified_anyway

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } catch {
      /* bleibt, wie es war — der Knopf ist erneut drückbar */
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  const toggleLike = () => run(async () => {
    if (liked) {
      await withdrawFeatureSupport(card.id)
      return
    }
    await supportFeatureWish(card.id, { ...(likeText.trim() ? { text: likeText.trim() } : {}), app_context: appContext })
    onLiked?.()
  })
  const toggleAbo = () => run(() => card.subscribed ? unsubscribeFeature(card.id) : subscribeFeature(card.id))

  const likeLabel = variant === 'card'
    ? `👍 ${card.request_count}`
    : ownRequest ? '✓ Von dir angefragt' : liked ? '👍 Gefällt dir — zurücknehmen' : '👍 Brauchen wir auch'
  const aboLabel = card.notified_anyway
    ? (variant === 'card' ? '🔔' : '🔔 Du wirst benachrichtigt')
    : card.subscribed
      ? (variant === 'card' ? '🔔 Abonniert' : '🔔 Abonniert — beenden')
      : '🔔 Abonnieren'

  return (
    <div className={`roadmap-reactions is-${variant}`}>
      <button type="button" className="roadmap-reaction" aria-pressed={liked || ownRequest}
              aria-label={variant === 'card'
                ? `Gefällt mir (${card.request_count})${liked ? ' — zurücknehmen' : ''}`
                : undefined}
              title={ownRequest ? 'Von dir angefragt' : liked ? 'Like zurücknehmen' : 'Gefällt mir — brauchen wir auch'}
              disabled={busy || !online || ownRequest} onClick={toggleLike}>
        {likeLabel}
      </button>
      <button type="button" className="roadmap-reaction" aria-pressed={subscribed}
              aria-label={variant === 'card' && card.notified_anyway ? 'Du wirst benachrichtigt' : undefined}
              title={card.notified_anyway
                ? 'Deine Anfrage — du bekommst ohnehin bei jedem Phasenwechsel eine Nachricht'
                : 'Push bei jedem Phasenwechsel'}
              disabled={busy || !online || !!card.notified_anyway} onClick={toggleAbo}>
        {aboLabel}
      </button>
    </div>
  )
}

// ── Detail ──────────────────────────────────────────────────────────────────

function FeatureSheet({ featureId, isAdminRole, appContext, onClose, onChanged }: {
  featureId: string
  isAdminRole: boolean
  appContext: 'pwa' | 'admin'
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<PublicFeatureDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')

  const load = useCallback(async () => {
    try {
      setDetail(await fetchRoadmapFeature(featureId))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [featureId])

  useEffect(() => { void load() }, [load])

  const history = [...(detail?.history ?? [])].reverse()

  return (
    <div className="roadmap-sheet-backdrop" onClick={onClose}>
      <div className={`roadmap-sheet wish-root${appContext === 'admin' ? ' is-admin' : ''}`}
           role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="wish-row" style={{ justifyContent: 'space-between' }}>
          <b style={{ flex: '1 1 auto' }}>{detail ? `${detail.reference} — ${detail.title}` : 'Roadmap'}</b>
          <button type="button" className="wish-btn-ghost" style={{ flex: '0 0 auto' }}
                  onClick={onClose} aria-label="Schliessen">×</button>
        </div>
        {!detail ? (
          <div className="wish-muted">{failed ? 'Konnte nicht geladen werden.' : 'Lädt …'}</div>
        ) : (
          <>
            <div>
              <span className="wish-phase wish-accent">{detail.phase_label}</span>
              <span className="wish-muted"> {sinceLabel(detail.phase_since)} · Ziel: {detail.target_label}
                {' · '}{AREA_LABEL[detail.area] ?? detail.area}</span>
            </div>
            {detail.public_reason && <div className="wish-quote">{detail.public_reason}</div>}
            {detail.description && <div style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</div>}

            <div>
              <div className="wish-muted" style={{ marginBottom: 4 }}>Verlauf</div>
              <ol className="roadmap-timeline">
                {history.map((e, i) => (
                  <li key={`${e.on}-${i}`}>
                    <div className="roadmap-timeline-head">
                      <span>{historyLine(e)}</span>
                      <span className="wish-muted">{fmtDay(e.on)}</span>
                    </div>
                    {e.text && <div className="wish-muted" style={{ whiteSpace: 'pre-wrap' }}>{e.text}</div>}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <div className="wish-muted" style={{ marginBottom: 4 }}>Aus eurem Betrieb angefragt von</div>
              {detail.from_our_tenant.length === 0 ? (
                <div className="wish-muted">noch niemandem</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {detail.from_our_tenant.map((p, i) => (
                    <li key={i}>
                      {p.is_me ? 'dir' : p.created_by_name ?? 'jemandem'} · {fmtDay(p.created_on)}
                      {' · '}{IMPORTANCE_LABEL[p.importance]}
                      {p.origin === 'unterstuetzung' ? ' (👍 gefällt)' : ''}
                      {isAdminRole && (p.problem || p.description) && (
                        <div className="wish-quote">{p.problem || p.description}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {detail.other_tenants > 0 && (
                <div className="wish-muted">
                  + {detail.other_tenants} {detail.other_tenants === 1 ? 'weiterer Betrieb' : 'weitere Betriebe'}
                </div>
              )}
            </div>

            {detail.mine === null && (
              <textarea className="wish-input" rows={2} maxLength={500} value={text}
                        placeholder="Wofür braucht ihr das? (optional)"
                        onChange={e => setText(e.target.value)} />
            )}
            <Reactions card={detail} appContext={appContext} variant="sheet" likeText={text}
                       onLiked={() => setText('')}
                       onChanged={() => { void load(); onChanged() }} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Board ───────────────────────────────────────────────────────────────────

type Tab = 'roadmap' | 'meine' | 'unsere'

interface Props {
  userId: string
  role: string
  appContext: 'pwa' | 'admin'
  /** Direkt ein Feature öffnen (Sprung aus «Meine Wünsche» der Blase). */
  initialFeatureId?: string | null
  /** Immer die schmale Darstellung (Phasen-Chips) — die PWA-Spalte ist 480px breit. */
  compact?: boolean
}

export default function Roadmap({ userId, role, appContext, initialFeatureId, compact = false }: Props) {
  const isAdminRole = ['admin', 'management', 'superadmin'].includes(role)
  const [tab, setTab] = useState<Tab>('roadmap')
  const [cards, setCards] = useState<BoardCard[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [selectedPhase, setSelectedPhase] = useState<Phase>('pruefung')
  const [showEnd, setShowEnd] = useState(false)
  const [area, setArea] = useState('')
  const [onlyOurs, setOnlyOurs] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(initialFeatureId ?? null)
  // Der Stand VOR diesem Besuch — einmal gelesen, dann für die Punkte benutzt.
  const [seenBefore] = useState<string | null>(() => loadSeen(userId))
  const mine = useMyWishes(true)
  const [ours, setOurs] = useState<MyWish[]>([])
  const [oursFailed, setOursFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRoadmap()
      setCards(res.features ?? [])
      setOffline(false)
      storeSeen(userId, new Date().toISOString())
    } catch (e) {
      // Die Roadmap kommt nicht in den Offline-Snapshot (Spec §5.8): sie ist
      // keine Arbeitsgrundlage auf der Baustelle.
      setOffline(isNetworkError(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (tab !== 'unsere' || !isAdminRole) return
    let cancelled = false
    fetchTenantWishes()
      .then(res => { if (!cancelled) { setOurs(res.requests ?? []); setOursFailed(false) } })
      .catch(() => { if (!cancelled) setOursFailed(true) })
    return () => { cancelled = true }
  }, [tab, isAdminRole])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter(c =>
      (!area || c.area === area) &&
      (!onlyOurs || c.own_count > 0) &&
      (!q || c.title.toLowerCase().includes(q) || c.reference.toLowerCase() === q))
  }, [cards, area, onlyOurs, query])

  const byPhase = useMemo(() => {
    const map: Partial<Record<Phase, BoardCard[]>> = {}
    for (const c of filtered) (map[c.phase] ??= []).push(c)
    for (const list of Object.values(map)) {
      list!.sort((a, b) =>
        (b.own_count > 0 ? 1 : 0) + b.other_tenants - ((a.own_count > 0 ? 1 : 0) + a.other_tenants)
        || String(b.last_request_on ?? '').localeCompare(String(a.last_request_on ?? '')))
    }
    return map
  }, [filtered])

  function card(c: BoardCard) {
    const isNew = !!seenBefore && !!c.updated_at && c.updated_at > seenBefore
    // Kein <button> um die ganze Karte: Like und Abo sind eigene Knöpfe, und
    // Knöpfe dürfen nicht ineinander stecken.
    return (
      <div key={c.id} className="wish-card roadmap-card">
        {isNew && <span className="wish-card-new" aria-label="Geändert seit deinem letzten Besuch" />}
        <button type="button" className="roadmap-card-open" onClick={() => setOpenId(c.id)} title="Details">
          <span className="wish-muted">{c.reference} · {AREA_LABEL[c.area] ?? c.area}</span>
          <span className="wish-card-title">{c.title}</span>
          <span className="wish-muted">Ziel: {c.target_label} · {sinceLabel(c.phase_since)}</span>
          <span className="wish-muted">
            👥 {demandLine(c)}
            {c.mine === 'anfrage' ? ' · von dir' : c.mine === 'unterstuetzung' ? ' · gefällt dir' : ''}
          </span>
        </button>
        <Reactions card={c} appContext={appContext} variant="card" onChanged={() => void load()} />
      </div>
    )
  }

  function column(p: Phase) {
    const list = byPhase[p] ?? []
    return (
      <section key={p} className={`roadmap-col${selectedPhase === p ? ' is-selected' : ''}`}
               aria-label={PHASE_LABEL[p]}>
        <div className="roadmap-col-head"><span>{PHASE_LABEL[p]}</span><span className="wish-muted">{list.length}</span></div>
        {list.length === 0
          ? <span className="wish-muted">—</span>
          : list.map(card)}
      </section>
    )
  }

  const endCount = END_PHASES.reduce((n, p) => n + (byPhase[p]?.length ?? 0), 0)

  return (
    <div className={`wish-root${appContext === 'admin' ? ' is-admin' : ''}${compact ? ' is-compact' : ''}`}>
      <div className="wish-switch" role="tablist">
        <button type="button" role="tab" aria-pressed={tab === 'roadmap'} onClick={() => setTab('roadmap')}>
          Roadmap
        </button>
        <button type="button" role="tab" aria-pressed={tab === 'meine'}
                onClick={() => { setTab('meine'); if (mine.unread > 0) void mine.markRead() }}>
          Meine Wünsche{mine.unread > 0 ? ` (${mine.unread})` : ''}
        </button>
        {isAdminRole && (
          <button type="button" role="tab" aria-pressed={tab === 'unsere'} onClick={() => setTab('unsere')}>
            Unsere Wünsche
          </button>
        )}
      </div>

      {tab === 'roadmap' && (
        <>
          {offline && (
            <div className="wish-muted" role="status">Die Roadmap ist nur online verfügbar.</div>
          )}
          <div className="roadmap-filters">
            <input className="wish-input" placeholder="Suchen" value={query}
                   onChange={e => setQuery(e.target.value)} aria-label="Roadmap durchsuchen" />
            <select className="wish-input" value={area} onChange={e => setArea(e.target.value)} aria-label="Bereich">
              <option value="">Alle Bereiche</option>
              {Object.entries(AREA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="wish-row" style={{ flex: '0 0 auto', gap: 6 }}>
              <input type="checkbox" checked={onlyOurs} onChange={e => setOnlyOurs(e.target.checked)} />
              <span>Nur unsere</span>
            </label>
          </div>

          <div className="roadmap-chips" role="group" aria-label="Phase">
            {BOARD_PHASES.map(p => (
              <button key={p} type="button" aria-pressed={selectedPhase === p} onClick={() => setSelectedPhase(p)}>
                {PHASE_LABEL[p]} ({byPhase[p]?.length ?? 0})
              </button>
            ))}
          </div>

          {!loading && cards.length === 0 && !offline ? (
            <div className="wish-muted">Noch nichts auf der Roadmap.</div>
          ) : (
            <div className="roadmap-board">{BOARD_PHASES.map(column)}</div>
          )}

          <button type="button" className="wish-link" aria-expanded={showEnd} onClick={() => setShowEnd(v => !v)}>
            {showEnd ? '▾' : '▸'} Später / Nicht geplant ({endCount})
          </button>
          {showEnd && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {END_PHASES.flatMap(p => (byPhase[p] ?? []).map(c => (
                <div key={c.id}>
                  <span className="wish-phase">{PHASE_LABEL[p]}</span>
                  {card(c)}
                </div>
              )))}
            </div>
          )}
        </>
      )}

      {tab === 'meine' && (
        <MyWishes wishes={mine.wishes} subscriptions={mine.subscriptions}
                  loading={mine.loading} failed={mine.failed}
                  onChanged={() => { void mine.reload(); void load() }}
                  onOpenFeature={id => { setTab('roadmap'); setOpenId(id) }} />
      )}

      {tab === 'unsere' && isAdminRole && (
        <MyWishes wishes={ours} failed={oursFailed} showPerson
                  emptyText="Aus eurem Betrieb gibt es noch keinen Wunsch."
                  onOpenFeature={id => { setTab('roadmap'); setOpenId(id) }} />
      )}

      {openId && (
        <FeatureSheet featureId={openId} isAdminRole={isAdminRole} appContext={appContext}
                      onClose={() => setOpenId(null)}
                      onChanged={() => { void load(); void mine.reload() }} />
      )}
    </div>
  )
}
