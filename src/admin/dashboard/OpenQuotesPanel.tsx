// Seitenpanel hinter den Offerten-Kacheln des Dashboards («Offerten in
// Bearbeitung», «Angenommene/Abgelehnte Offerten (14 Tage)») mit denselben
// Aktionen wie in der Offertenliste — Handler und Dialoge kommen aus quotes/useQuoteActions, die
// Knöpfe aus QuoteListParts. Ein Klick auf die Karte (nicht auf einen Knopf)
// öffnet das Projekt der Offerte; eine freistehende Offerte ohne Projekt bleibt
// eine reine Anzeige.
//
// «In Bearbeitung» zählt Entscheidungen (eine Variantengruppe A/B/C = eins),
// das Panel listet Dokumente — darum steht oben die eigene Anzahl.
import { useCallback } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { projektKarteProps } from './projektKarte'
import { listQuotesPage } from '../../api/admin/quotes'
import { fmtCHF, fmtDate } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'
import { ListPager } from '../components/ListPager'
import { LIST_PAGE_SIZE, usePagedList } from '../usePagedList'
import { QuoteRowActions, QuoteStatusCell } from '../operative/quotes/QuoteListParts'
import { useQuoteActions } from '../operative/quotes/useQuoteActions'
import { QuoteEditForm } from '../operative/quotes/QuoteEditForm'

/** Welche Offerten — je Kachel dieselbe Auswahl wie ihr Zähler im Backend
 *  (agents/routers/kpi.py). */
export const QUOTE_PANELS = {
  // db/quotes.py::list_open_quotes
  offen: { titel: 'Offerten in Bearbeitung', statuses: ['entwurf', 'gesendet'], untertitel: 'Entwurf und Gesendet', leer: 'Keine offenen Offerten', tage: undefined },
  // db/quotes.py::list_recently_accepted_quotes / list_recently_rejected_quotes
  akzeptiert: { titel: 'Angenommene Offerten', statuses: ['akzeptiert'], untertitel: 'angenommen in den letzten 14 Tagen', leer: 'Keine angenommenen Offerten in den letzten 14 Tagen', tage: 14 },
  abgelehnt: { titel: 'Abgelehnte Offerten', statuses: ['abgelehnt'], untertitel: 'abgelehnt in den letzten 14 Tagen', leer: 'Keine abgelehnten Offerten in den letzten 14 Tagen', tage: 14 },
} as const
export type QuotePanelArt = keyof typeof QUOTE_PANELS

export interface OpenQuotesPanelProps {
  /** Welche Kachel — Vorgabe «Offerten in Bearbeitung». */
  art?: QuotePanelArt
  onClose: () => void
  /** Eine Aktion hat etwas geändert — das Dashboard zählt neu. */
  onChanged: () => void
  onOpenProject?: (projectId: string) => void
}

export function OpenQuotesPanel({ art = 'offen', onClose, onChanged, onOpenProject }: OpenQuotesPanelProps) {
  const cfg = QUOTE_PANELS[art]
  const { toast, showToast } = useToast()
  const fetchPage = useCallback(
    (page: number, search: string) => listQuotesPage({
      page, pageSize: LIST_PAGE_SIZE, statuses: cfg.statuses, search, sort: 'created_at', dir: 'desc',
      entschiedenSeitTagen: cfg.tage,
    }),
    [cfg],
  )
  const list = usePagedList(fetchPage)
  const reload = () => { void list.reload(); onChanged() }
  const { flags, actions, acting, editQuote, closeEdit, dialogs } = useQuoteActions({ reload, showToast })
  const quotes = list.data?.rows ?? []

  // Bearbeiten: dieselbe Maske wie in der Offertenliste, im breiten Panel. Kein
  // Schliessen per Klick daneben — die Maske hätte ungespeicherte Eingaben.
  if (editQuote) {
    return (
      <div className="admin-modal-overlay">
        <div className="admin-modal" style={{ width: 1100, maxWidth: '100vw' }}>
          <div className="admin-page">
            <QuoteEditForm
              quote={editQuote}
              onDone={warning => { closeEdit(); reload(); showToast(warning ?? 'Offerte gespeichert', warning ? 'error' : 'success') }}
              onCancel={closeEdit}
            />
          </div>
        </div>
        <ToastHost toast={toast} />
      </div>
    )
  }

  return (
    <>
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ width: 620 }}>
        <div className="admin-modal-header">
          <div>
            <div className="admin-modal-title">{cfg.titel}</div>
            {list.data && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {list.data.total} Offerten · {cfg.untertitel}
              </div>
            )}
          </div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <input
            className="admin-search"
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="Projekt, Kunde oder Offerten-Nr. suchen…"
            value={list.searchInput}
            onChange={e => list.setSearchInput(e.target.value)}
          />
          {list.loading && !list.data && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
          {list.failed && !list.data && <div className="admin-empty" role="alert">Offerten konnten nicht geladen werden.</div>}
          {list.data && quotes.length === 0 && <div className="admin-empty">{cfg.leer}</div>}
          {quotes.length > 0 && (
            <div className="admin-list" aria-busy={list.loading} style={list.loading ? { opacity: 0.6 } : undefined}>
              {quotes.map(q => {
                return (
                  <div
                    key={q.id}
                    className="admin-list-item"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                    {...projektKarteProps(q.project_id, onOpenProject)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{q.project_name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          {q.quote_number}{q.customer_name ? ` · ${q.customer_name}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {fmtCHF(q.total_amount)} · erstellt {fmtDate(q.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <QuoteStatusCell quote={q} flags={flags} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <QuoteRowActions quote={q} flags={flags} acting={acting} on={actions} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <ListPager
            page={list.page}
            pageSize={LIST_PAGE_SIZE}
            total={list.data?.total ?? 0}
            loading={list.loading}
            onPage={list.setPage}
          />
        </div>
      </div>
    </div>
    {/* Neben dem Panel, nicht darin: die Dialoge legen ihr eigenes Overlay darüber. */}
    {dialogs}
    <ToastHost toast={toast} />
    </>
  )
}
