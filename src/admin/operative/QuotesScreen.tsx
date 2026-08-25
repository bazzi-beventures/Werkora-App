import { useEffect, useState } from 'react'
import { getQuoteDetail, listQuotes, sendQuoteRejection, setQuoteStatus } from '../../api/admin/quotes'
import { getAdminStaff } from '../../api/admin/staff'
import { QUOTE_STATUS_LABELS } from '../constants/statuses'
import { fmtCHF, fmtDate } from '../utils/format'
import { StatusFilterPopover } from '../components/StatusFilterPopover'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { SendQuoteDialog } from './SendQuoteDialog'
import { SendOrderConfirmationDialog, SendThankyouDialog } from './SendQuoteMailDialog'
import { useToast, ToastHost } from '../components/useToast'
import { getMe } from '../../api/auth'
import { getFeature, isFeatureEnabled } from '../../api/modules'
import { quoteWaitHours } from './quoteFeedback'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { QuoteRowActions, QuoteStatusCell } from './quotes/QuoteListParts'
import type { QuoteActionHandlers, QuoteListFlags } from './quotes/QuoteListParts'
import { QuoteCreateForm } from './quotes/QuoteCreateForm'
import { QuoteEditForm } from './quotes/QuoteEditForm'
import type { ProjektleiterOption, Quote, QuoteDetail } from './quotes/quoteTypes'

const STATUS_LABELS = QUOTE_STATUS_LABELS

// ─── Main Screen ────────────────────────────────────────────

interface QuotesScreenProps {
  initialStatus?: string | null
  onConsumed?: () => void
}

export default function QuotesScreen({ initialStatus, onConsumed }: QuotesScreenProps = {}) {
  const isMobile = useIsMobile()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilters, setStatusFilters] = useState<Set<string>>(() => {
    if (initialStatus && ['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert'].includes(initialStatus)) {
      return new Set([initialStatus])
    }
    return new Set(['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage'])
  })

  useEffect(() => {
    if (initialStatus && onConsumed) onConsumed()
  }, [])
  const [search, setSearch] = useState('')
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const [projektleiterOptions, setProjektleiterOptions] = useState<ProjektleiterOption[]>([])
  const [acting, setActing] = useState<number | null>(null)
  const { toast, showToast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null)
  // Send quote
  const [sendQuote, setSendQuote] = useState<Quote | null>(null)
  // Danke-Mail-Dialog (Feature offerte_dank_mail): fragt analog zum Offerten-Versand
  // zuerst die Empfänger-Adresse ab, vorbelegt mit der Kunden-E-Mail der Offerte.
  const [thankyouQuote, setThankyouQuote] = useState<Quote | null>(null)
  // Auftragsbestätigungs-Dialog: gleiche Empfänger-Abfrage, aber ohne Feature-Bedingung —
  // der Knopf steht bei jeder angenommenen Offerte bereit.
  const [orderConfirmationQuote, setOrderConfirmationQuote] = useState<Quote | null>(null)
  // Danke-Mail bei Offerten-Annahme (Feature offerte_dank_mail): steuert den
  // „Dankeschön senden"-Knopf bei angenommenen Offerten (Per-Knopfdruck-Modus bzw.
  // Fallback, falls der Auto-Versand ausblieb).
  const [dankEnabled, setDankEnabled] = useState(false)
  // Absage-Mail bei Offerten-Ablehnung (Feature offerte_absage_mail): steuert den
  // „Absage senden"-Knopf bei abgelehnten Offerten (Per-Knopfdruck-Modus bzw.
  // Fallback, falls der Auto-Versand ausblieb).
  const [absageEnabled, setAbsageEnabled] = useState(false)
  // Kennzeichnung «Kein Feedback» (Feature offerte_kein_feedback_meldung): ab wann
  // eine versendete Offerte als unbeantwortet gilt. 0 = Feature aus, keine Kennzeichnung.
  const [feedbackWaitHours, setFeedbackWaitHours] = useState(0)

  async function load() {
    setLoading(true)
    try {
      setQuotes(await listQuotes())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    getMe().then(me => {
      setDankEnabled(isFeatureEnabled(me, 'offerte_dank_mail'))
      setAbsageEnabled(isFeatureEnabled(me, 'offerte_absage_mail'))
      const fb = getFeature<{ enabled?: boolean; stunden?: number }>(me, 'offerte_kein_feedback_meldung')
      setFeedbackWaitHours(fb?.enabled ? quoteWaitHours(fb) : 0)
    }).catch(() => {})
  }, [])

  async function handleSendRejection(id: number) {
    setActing(id)
    try {
      const res = await sendQuoteRejection(id)
      showToast(res.message || 'Absage-Mail gesendet', 'success')
      load()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Absage-Mail fehlgeschlagen', 'error')
    } finally {
      setActing(null)
    }
  }

  useEffect(() => {
    getAdminStaff()
      .then(staff => {
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => setProjektleiterOptions([]))
  }, [])

  async function handleEdit(id: number) {
    try {
      setEditQuote(await getQuoteDetail(id))
    } catch {
      showToast('Offerte konnte nicht geladen werden', 'error')
    }
  }

  async function handleStatus(id: number, status: string) {
    setActing(id)
    try {
      await setQuoteStatus(id, status)
      showToast(`Status auf «${STATUS_LABELS[status]}» gesetzt`, 'success')
      load()
    } catch {
      showToast('Fehler beim Aktualisieren', 'error')
    } finally {
      setActing(null)
    }
  }

  const ALL_STATUSES = ['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert']

  // Was Tabelle und Karten gemeinsam brauchen — einmal gebaut, an beide gereicht.
  const flags: QuoteListFlags = { dankEnabled, absageEnabled, feedbackWaitHours }
  const actions: QuoteActionHandlers = {
    onEdit: handleEdit,
    onSend: setSendQuote,
    onThankyou: setThankyouQuote,
    onOrderConfirmation: setOrderConfirmationQuote,
    onSendRejection: handleSendRejection,
    onStatus: handleStatus,
  }

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilters.has(q.status)
    const needle = search.toLowerCase()
    const matchSearch = q.project_name.toLowerCase().includes(needle) ||
      q.quote_number.toLowerCase().includes(needle) ||
      (q.customer_name ?? '').toLowerCase().includes(needle)
    const matchPl = !projektleiterFilter || q.projektleiter_id === projektleiterFilter
    return matchStatus && matchSearch && matchPl
  })

  if (showCreate) {
    return (
      <div className="admin-page">
        <QuoteCreateForm
          onDone={warning => { setShowCreate(false); load(); showToast(warning ?? 'Offerte erstellt', warning ? 'error' : 'success') }}
          onCancel={() => setShowCreate(false)}
        />
      </div>
    )
  }

  if (editQuote) {
    return (
      <div className="admin-page">
        <QuoteEditForm
          quote={editQuote}
          onDone={warning => { setEditQuote(null); load(); showToast(warning ?? 'Offerte gespeichert', warning ? 'error' : 'success') }}
          onCancel={() => setEditQuote(null)}
        />
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offerten</div>
          <div className="admin-page-subtitle">{filtered.length} Einträge</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowCreate(true)}>
          + Offerte erstellen
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt, Kunde oder Offerten-Nr. suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          <StatusFilterPopover
            allStatuses={ALL_STATUSES}
            statusLabels={STATUS_LABELS}
            selected={statusFilters}
            onChange={setStatusFilters}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          /* Am Handy Karten statt Tabelle — sieben Spalten passen dort nicht.
             Status und Aktionen sind dieselben Bausteine wie in der Tabelle. */
          <AdminCardList
            items={filtered}
            keyFor={q => String(q.id)}
            empty="Keine Offerten gefunden."
            renderCard={q => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{q.quote_number}</span>
                  <QuoteStatusCell quote={q} flags={flags} />
                </div>
                <div className="admin-card-meta"><strong>{q.project_name}</strong></div>
                <div className="admin-card-meta">
                  {q.customer_name ? `${q.customer_name} · ` : ''}{fmtCHF(q.total_amount)} · erstellt {fmtDate(q.created_at)}
                </div>
                <div className="admin-card-actions">
                  <QuoteRowActions quote={q} flags={flags} acting={acting} on={actions} />
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Projekt</th>
                <th>Kunde</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Erstellt</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Offerten gefunden.</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{q.quote_number}</td>
                  <td><strong>{q.project_name}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>{q.customer_name || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(q.total_amount)}</td>
                  <td><QuoteStatusCell quote={q} flags={flags} /></td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(q.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <QuoteRowActions quote={q} flags={flags} acting={acting} on={actions} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialog: Offerte senden */}
      {sendQuote && (
        <SendQuoteDialog
          quoteId={sendQuote.id}
          header={<>{sendQuote.quote_number} · {fmtCHF(sendQuote.total_amount)}<br />Projekt: {sendQuote.project_name}</>}
          onClose={() => setSendQuote(null)}
          onSent={email => { showToast(`Offerte an ${email} gesendet`, 'success'); setSendQuote(null); load() }}
        />
      )}

      {/* Dialog: Danke-Mail senden (fragt zuerst die Empfänger-Adresse ab) */}
      {thankyouQuote && (
        <SendThankyouDialog
          quoteId={thankyouQuote.id}
          defaultEmail={thankyouQuote.customer_email || ''}
          header={<>{thankyouQuote.quote_number} · {fmtCHF(thankyouQuote.total_amount)}<br />Projekt: {thankyouQuote.project_name}</>}
          onClose={() => setThankyouQuote(null)}
          onSent={msg => { showToast(msg, 'success'); setThankyouQuote(null); load() }}
        />
      )}

      {/* Dialog: Auftragsbestätigung senden (kein Feature-Flag, siehe QuoteListParts) */}
      {orderConfirmationQuote && (
        <SendOrderConfirmationDialog
          quoteId={orderConfirmationQuote.id}
          defaultEmail={orderConfirmationQuote.customer_email || ''}
          alreadySentAt={orderConfirmationQuote.order_confirmation_sent_at}
          header={<>{orderConfirmationQuote.quote_number} · {fmtCHF(orderConfirmationQuote.total_amount)}<br />Projekt: {orderConfirmationQuote.project_name}</>}
          onClose={() => setOrderConfirmationQuote(null)}
          onSent={msg => { showToast(msg, 'success'); setOrderConfirmationQuote(null); load() }}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}
