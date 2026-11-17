import { useCallback, useEffect, useState } from 'react'
import { listQuotesPage } from '../../api/admin/quotes'
import { getAdminStaff } from '../../api/admin/staff'
import { QUOTE_STATUS_LABELS } from '../constants/statuses'
import { fmtCHF, fmtDate } from '../utils/format'
import { StatusFilterPopover } from '../components/StatusFilterPopover'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { useToast, ToastHost } from '../components/useToast'
import { AdminCardList } from '../components/AdminCardList'
import { ListPager } from '../components/ListPager'
import { useIsMobile } from '../useIsMobile'
import { LIST_PAGE_SIZE, usePagedList } from '../usePagedList'
import { useListSort } from '../useListSort'
import { SortableTh } from '../components/SortableTh'
import { QUOTE_EDITABLE_STATUSES, QuoteRowActions, QuoteStatusCell } from './quotes/QuoteListParts'
import { useQuoteActions } from './quotes/useQuoteActions'
import { QuoteCreateForm } from './quotes/QuoteCreateForm'
import { QuoteEditForm } from './quotes/QuoteEditForm'
import type { ProjektleiterOption, Quote } from './quotes/quoteTypes'

const STATUS_LABELS = QUOTE_STATUS_LABELS
const ALL_STATUSES = ['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage', 'archiviert']
// Stabile Referenz für «noch nichts geladen» — ein frisches [] je Render wäre für
// jede Abhängigkeitsliste eine neue Liste.
const NO_QUOTES: Quote[] = []

// Sortierbare Spalten = Katalog des Endpoints (db/quotes.py, `_QUOTE_SORT_MAP`).
type QuoteSortKey =
  'quote_number' | 'project_name' | 'customer_name' | 'projektleiter' | 'total_amount' | 'status' | 'created_at'

// ─── Main Screen ────────────────────────────────────────────

interface QuotesScreenProps {
  initialStatus?: string | null
  onConsumed?: () => void
  /** Sprung ins Projekt der Offerte (WW-41) — sonst hiess es: raus aus den
   *  Offerten, in die Projekte, nach dem Namen suchen. */
  onOpenProject?: (projectId: string) => void
}

// Projektname als Link ins Projekt. Nur mit `project_id`: eine freistehende Offerte
// hat kein Projekt, und ein Sprung über den Namen träfe bei zwei gleichnamigen
// Liegenschaften die falsche.
function ProjectName({ quote: q, onOpenProject }: { quote: Quote; onOpenProject?: (projectId: string) => void }) {
  if (!q.project_id || !onOpenProject) return <strong>{q.project_name}</strong>
  const projectId = q.project_id
  return (
    <button
      type="button"
      className="admin-link-btn"
      style={{ padding: 0, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', font: 'inherit', fontWeight: 700, textAlign: 'left' }}
      title="Projekt öffnen"
      // Zeile bzw. Karte öffnen beim Klick die Offerte — der Link darf das nicht auch noch.
      onClick={e => { e.stopPropagation(); onOpenProject(projectId) }}
    >
      {q.project_name}
    </button>
  )
}

export default function QuotesScreen({ initialStatus, onConsumed, onOpenProject }: QuotesScreenProps = {}) {
  const isMobile = useIsMobile()
  const [statusFilters, setStatusFilters] = useState<Set<string>>(() => {
    if (initialStatus && ALL_STATUSES.includes(initialStatus)) {
      return new Set([initialStatus])
    }
    return new Set(['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage'])
  })

  useEffect(() => {
    if (initialStatus && onConsumed) onConsumed()
    // Deep-Link-Filter wird beim Mount einmal übernommen und quittiert;
    // onConsumed entsteht je Render neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const [projektleiterOptions, setProjektleiterOptions] = useState<ProjektleiterOption[]>([])
  // id → Name für ALLE Mitarbeiter, nicht nur die mit PL-Häkchen: löst den
  // Projektleiter alter Offerten ohne Snapshot auf, auch wenn er das Häkchen
  // inzwischen nicht mehr trägt (wie ProjectsScreen).
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({})
  const { toast, showToast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  // Vorgabe wie bisher: neueste zuerst.
  const [sort, toggleSort] = useListSort<QuoteSortKey>({ key: 'created_at', dir: 'desc' })
  // Seitenweise vom Server: Status, Suche und Projektleiter filtert, die
  // Reihenfolge bestimmt die Datenbank, über die Leitung gehen 50 Zeilen
  // (api/admin/listPage.ts).
  const fetchPage = useCallback(
    (page: number, search: string) => listQuotesPage({
      page, pageSize: LIST_PAGE_SIZE, statuses: statusFilters, search,
      projektleiterId: projektleiterFilter, sort: sort.key, dir: sort.dir,
    }),
    [statusFilters, projektleiterFilter, sort],
  )
  const list = usePagedList(fetchPage)
  // Sortieren → Seite 1, im selben Handler (wie die Filter).
  const onSort = (key: QuoteSortKey) => { toggleSort(key); list.setPage(1) }
  const quotes = list.data?.rows ?? NO_QUOTES
  const total = list.data?.total ?? 0
  const load = list.reload
  // Handler und Dialoge der Aktionen — geteilt mit dem Dashboard-Panel
  // «Offerten in Bearbeitung» (quotes/useQuoteActions.tsx).
  const { flags, actions, acting, editQuote, closeEdit, dialogs } = useQuoteActions({ reload: load, showToast })
  const handleEdit = actions.onEdit

  useEffect(() => {
    getAdminStaff()
      .then(staff => {
        setStaffNameById(Object.fromEntries(staff.map(s => [s.id, s.name])))
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => setProjektleiterOptions([]))
  }, [])

  // Der Projektleiter, der die Offerte erstellt hat: der Snapshot auf der
  // Offerte, sonst (alte Offerten) der heutige des Projekts.
  const projektleiterName = (q: Quote): string =>
    q.projektleiter_name || (q.projektleiter_id ? staffNameById[q.projektleiter_id] ?? '' : '')

  const emptyText = list.failed ? 'Offerten konnten nicht geladen werden.' : 'Keine Offerten gefunden.'

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
          onDone={warning => { closeEdit(); load(); showToast(warning ?? 'Offerte gespeichert', warning ? 'error' : 'success') }}
          onCancel={closeEdit}
        />
      </div>
    )
  }

  return (
    // admin-page-wide: acht Spalten, und die Aktionen allein brauchen vier bis
    // sechs Knöpfe. Bei den 1200px von .admin-page brachen sie in zwei Zeilen um,
    // während rechts die Hälfte des Bildschirms leer blieb.
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offerten</div>
          <div className="admin-page-subtitle">{total} Einträge</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowCreate(true)}>
          + Offerte erstellen
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt, Kunde, Projektleiter oder Offerten-Nr. suchen…"
            value={list.searchInput}
            onChange={e => list.setSearchInput(e.target.value)}
          />
          {/* Filterwechsel → Seite 1, im selben Handler (siehe usePagedList). */}
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={v => { setProjektleiterFilter(v); list.setPage(1) }}
          />
          <StatusFilterPopover
            allStatuses={ALL_STATUSES}
            statusLabels={STATUS_LABELS}
            selected={statusFilters}
            onChange={v => { setStatusFilters(v); list.setPage(1) }}
          />
        </div>

        {/* Spinner nur beim ersten Laden. Danach bleibt die alte Seite stehen,
            bis die neue da ist — sonst flackert die Tabelle bei jedem Blättern. */}
        {list.loading && !list.data ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          /* Am Handy Karten statt Tabelle — sieben Spalten passen dort nicht.
             Status und Aktionen sind dieselben Bausteine wie in der Tabelle. */
          <AdminCardList
            items={quotes}
            keyFor={q => String(q.id)}
            empty={emptyText}
            onItemClick={q => { if (QUOTE_EDITABLE_STATUSES.includes(q.status)) handleEdit(q.id) }}
            renderCard={q => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{q.quote_number}</span>
                  <QuoteStatusCell quote={q} flags={flags} />
                </div>
                <div className="admin-card-meta"><ProjectName quote={q} onOpenProject={onOpenProject} /></div>
                <div className="admin-card-meta">
                  {q.customer_name ? `${q.customer_name} · ` : ''}{fmtCHF(q.total_amount)} · erstellt {fmtDate(q.created_at)}
                  {projektleiterName(q) ? ` · ${projektleiterName(q)}` : ''}
                </div>
                {/* Die Knöpfe erledigen ihre eigene Aktion — sie dürfen nicht
                    zusätzlich den Karten-Klick auslösen und die Maske öffnen. */}
                <div className="admin-card-actions" onClick={e => e.stopPropagation()}>
                  <QuoteRowActions quote={q} flags={flags} acting={acting} on={actions} />
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table" aria-busy={list.loading} style={list.loading ? { opacity: 0.6 } : undefined}>
            <thead>
              <tr>
                <SortableTh label="Nr." sortKey="quote_number" sort={sort} onSort={onSort} />
                <SortableTh label="Projekt" sortKey="project_name" sort={sort} onSort={onSort} />
                <SortableTh label="Kunde" sortKey="customer_name" sort={sort} onSort={onSort} />
                <SortableTh label="Projektleiter" sortKey="projektleiter" sort={sort} onSort={onSort} />
                <SortableTh label="Betrag" sortKey="total_amount" sort={sort} onSort={onSort} />
                <SortableTh label="Status" sortKey="status" sort={sort} onSort={onSort} title="Alphabetisch nach Status" />
                <SortableTh label="Erstellt" sortKey="created_at" sort={sort} onSort={onSort} />
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr><td colSpan={8} className="admin-table-empty">{emptyText}</td></tr>
              ) : quotes.map(q => {
                // Ein Klick irgendwo auf die Zeile öffnet die Offerte — dieselbe
                // Maske wie «Bearbeiten» und bei denselben Status. Klicks auf
                // Knöpfe und Links (PDF, Senden, Akzeptieren …) dürfen dabei NICHT
                // zusätzlich die Maske öffnen; dieselbe Prüfung wie in der
                // Offerten-Liste des Projekts (projectDetail/QuotesTab.tsx).
                const openable = QUOTE_EDITABLE_STATUSES.includes(q.status)
                return (
                <tr
                  key={q.id}
                  onClick={openable ? e => { if (!(e.target as HTMLElement).closest('button, a')) handleEdit(q.id) } : undefined}
                  title={openable ? 'Offerte öffnen' : undefined}
                  style={openable ? { cursor: 'pointer' } : undefined}
                >
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{q.quote_number}</td>
                  <td><ProjectName quote={q} onOpenProject={onOpenProject} /></td>
                  <td style={{ color: 'var(--muted)' }}>{q.customer_name || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{projektleiterName(q) || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(q.total_amount)}</td>
                  <td><QuoteStatusCell quote={q} flags={flags} /></td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(q.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <QuoteRowActions quote={q} flags={flags} acting={acting} on={actions} />
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <ListPager
          page={list.page}
          pageSize={LIST_PAGE_SIZE}
          total={total}
          loading={list.loading}
          onPage={list.setPage}
        />
      </div>

      {dialogs}

      <ToastHost toast={toast} />
    </div>
  )
}
