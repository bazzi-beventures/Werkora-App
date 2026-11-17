// Seitenpanel hinter der Kachel «Rechnungsentwürfe»: erstellte, nie versendete
// Rechnungen (Status ausstehend/offen). Die Kachel ist eine Pendenz — am Ende
// des Tages sollte sie auf 0 stehen; «Rechnungen offen» dagegen ist nur eine
// gefilterte Liste und führt weiter in die Rechnungen.
//
// Dieselben Knöpfe und Dialoge wie die Rechnungsliste (invoices/useInvoiceActions).
// Ein Klick auf die Karte öffnet das Projekt. Der Hinweis «Evtl. bereits
// verrechnet» kommt vom Server (services/verrechnung_check.py).
import { useCallback } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { listInvoicesPage, type Invoice } from '../../api/admin/invoices'
import { INVOICE_STATUS_BADGE, INVOICE_STATUS_LABELS } from '../constants/statuses'
import { fmtCHF, fmtDate } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'
import { ListPager } from '../components/ListPager'
import { LIST_PAGE_SIZE, usePagedList } from '../usePagedList'
import {
  EvtlVerrechnetBadge, InvoiceRowActions, useInvoiceActions,
} from '../operative/invoices/useInvoiceActions'
import { projektKarteProps } from './projektKarte'

/** Dieselben Status wie der Zähler (agents/routers/kpi.py, `draft_invoices`). */
const DRAFT_STATUSES = ['ausstehend', 'offen']
const NO_INVOICES: Invoice[] = []
// Entwürfe stehen nie in bexio (erst versendete werden übertragen) — keine Pille.
const KEIN_BEXIO = {}

export interface DraftInvoicesPanelProps {
  onClose: () => void
  /** Eine Aktion hat etwas geändert — das Dashboard zählt neu. */
  onChanged: () => void
  onOpenProject?: (projectId: string) => void
}

export function DraftInvoicesPanel({ onClose, onChanged, onOpenProject }: DraftInvoicesPanelProps) {
  const { toast, showToast } = useToast()
  const fetchPage = useCallback(
    (page: number, search: string) => listInvoicesPage({
      page, pageSize: LIST_PAGE_SIZE, statuses: DRAFT_STATUSES, search, sort: 'created_at', dir: 'desc',
    }),
    [],
  )
  const list = usePagedList(fetchPage)
  const invoices = list.data?.rows ?? NO_INVOICES
  const { acting, actions, dialogs } = useInvoiceActions({
    reload: () => void list.reload(), showToast, onChanged,
    bexio: KEIN_BEXIO, refreshBexio: () => {},
  })

  return (
    <>
      <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
        <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ width: 620 }}>
          <div className="admin-modal-header">
            <div>
              <div className="admin-modal-title">Rechnungsentwürfe</div>
              {list.data && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {list.data.total} erstellt, noch nicht versendet
                </div>
              )}
            </div>
            <button className="admin-modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="admin-modal-body">
            <input
              className="admin-search"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="Projekt oder Rechnungs-Nr. suchen…"
              value={list.searchInput}
              onChange={e => list.setSearchInput(e.target.value)}
            />
            {list.loading && !list.data && <div className="admin-loading"><div className="admin-spinner" />Lade…</div>}
            {list.failed && !list.data && <div className="admin-empty" role="alert">Rechnungen konnten nicht geladen werden.</div>}
            {list.data && invoices.length === 0 && <div className="admin-empty">Keine Rechnungsentwürfe — alles versendet</div>}
            {invoices.length > 0 && (
              <div className="admin-list" aria-busy={list.loading} style={list.loading ? { opacity: 0.6 } : undefined}>
                {invoices.map(inv => (
                  <div
                    key={inv.id}
                    className="admin-list-item"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                    {...projektKarteProps(inv.project_id, onOpenProject)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{inv.project_name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          {inv.invoice_number}
                          {inv.invoice_kind === 'anzahlung' ? ' · Anzahlung' : ''}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {fmtCHF(inv.total_amount)} · erstellt {fmtDate(inv.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span className={`admin-badge ${INVOICE_STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                          {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                        </span>
                        <EvtlVerrechnetBadge invoice={inv} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <InvoiceRowActions invoice={inv} acting={acting} on={actions} />
                    </div>
                  </div>
                ))}
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
