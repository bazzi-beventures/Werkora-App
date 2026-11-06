import { useCallback, useEffect, useState } from 'react'
import { deleteCustomer, getCustomer, listCustomers, salutationLabel } from '../../api/admin/customers'
import type { Customer, CustomersListResponse } from '../../api/admin/customers'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { useToast, ToastHost } from '../components/useToast'
import { CustomerForm } from './CustomerForm'

const PAGE_SIZE = 50

interface CustomersScreenProps {
  /** Klick auf ein Projekt der Kundenstammseite → Projektmaske (WF-3). */
  onOpenProject?: (projectId: string) => void
  /** Direkt diesen Kunden öffnen (Deep-Link aus einer Erinnerung). */
  openCustomerId?: string
  onConsumedCustomerId?: () => void
}

export default function CustomersScreen({
  onOpenProject, openCustomerId, onConsumedCustomerId,
}: CustomersScreenProps = {}) {
  const isMobile = useIsMobile()
  const [data, setData] = useState<CustomersListResponse>({ rows: [], total: 0, page: 1, page_size: PAGE_SIZE })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Customer | null | 'new'>(null)
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Suche: 300ms Debounce, damit nicht jeder Tastendruck einen Roundtrip ausloest.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Suche aendern → zurueck auf Seite 1.
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listCustomers({ page, pageSize: PAGE_SIZE, search: debouncedSearch }))
    } catch {
      setData({ rows: [], total: 0, page: 1, page_size: PAGE_SIZE })
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page])

  useEffect(() => { load() }, [load])

  const { toast, showToast } = useToast()

  // Sprung auf einen bestimmten Kunden (Mail/Push einer Erinnerung). Der Kunde
  // wird einzeln geholt: er steht nicht zwingend auf der ersten Listenseite.
  // Verbraucht wird der Sprung sofort, damit ein späteres Zurück nicht erneut
  // auf denselben Kunden springt.
  useEffect(() => {
    if (!openCustomerId) return
    onConsumedCustomerId?.()
    getCustomer(openCustomerId)
      .then(c => setEditing(c))
      .catch(() => showToast('Kunde nicht gefunden', 'error'))
  }, [openCustomerId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteCustomer(confirmDelete.id)
      showToast(`«${confirmDelete.name}» gelöscht`)
      setConfirmDelete(null)
      load()
    } catch {
      showToast('Fehler beim Löschen')
    } finally {
      setDeleting(false)
    }
  }

  const { rows, total } = data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Kundenstamm</div>
          <div className="admin-page-subtitle">{total} Kunden</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setEditing('new')}>
          + Neuer Kunde
        </button>
      </div>

      {editing === 'new' && (
        <CustomerForm
          initial={null}
          onSave={() => { setEditing(null); load(); showToast('Kunde gespeichert') }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing && editing !== 'new' && (
        <CustomerForm
          initial={editing}
          onSave={() => { setEditing(null); load(); showToast('Kunde aktualisiert') }}
          onCancel={() => setEditing(null)}
          onOpenProject={onOpenProject}
        />
      )}

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            {debouncedSearch ? 'Kein Kunde gefunden.' : 'Noch keine Kunden angelegt.'}
          </div>
        ) : (
          <>
            {isMobile ? (
              <AdminCardList
                items={rows}
                keyFor={c => String(c.id)}
                onItemClick={c => setEditing(c)}
                empty="Kein Kunde gefunden."
                renderCard={c => (
                  <>
                    <div className="admin-card-head">
                      <span className="admin-card-title">
                        {salutationLabel(c.salutation) && (
                          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
                            {salutationLabel(c.salutation)}{' '}
                          </span>
                        )}
                        {c.name}
                      </span>
                      {c.company && <span className="admin-card-meta">{c.company}</span>}
                    </div>
                    {(c.email || c.phone) && (
                      <div className="admin-card-meta">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
                    )}
                    {(c.additional_emails ?? []).map((a, i) => (
                      <div key={i} className="admin-card-meta">{a.label ? `${a.label}: ${a.email}` : a.email}</div>
                    ))}
                    {(c.billing_address ?? c.address) && (
                      <div className="admin-card-meta">{c.billing_address ?? c.address}</div>
                    )}
                    <div className="admin-card-actions">
                      <button
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={e => { e.stopPropagation(); setConfirmDelete(c) }}
                      >
                        Löschen
                      </button>
                    </div>
                  </>
                )}
              />
            ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Firma</th>
                  <th>E-Mail</th>
                  <th>Mobil</th>
                  <th>Festnetz</th>
                  <th>Rechnungsadresse</th>
                  <th>Objektadresse (Default)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id} onClick={() => setEditing(c)}>
                    {/* Anrede als gedämpftes Präfix statt eigener Spalte — die
                        Tabelle hat schon sieben, und die Anrede ist ohne den
                        Namen daneben sinnlos. */}
                    <td style={{ fontWeight: 500 }}>
                      {salutationLabel(c.salutation) && (
                        <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
                          {salutationLabel(c.salutation)}{' '}
                        </span>
                      )}
                      {c.name}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{c.company ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>
                      {c.email ?? '—'}
                      {(c.additional_emails?.length ?? 0) > 0 && (
                        <span
                          style={{ marginLeft: 6, fontSize: 12 }}
                          title={c.additional_emails!.map(a => a.label ? `${a.label}: ${a.email}` : a.email).join('\n')}
                        >
                          +{c.additional_emails!.length}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.phone_landline ?? '—'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.billing_address ?? c.address ?? '—'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.object_address ?? '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="admin-btn-icon danger"
                        title="Kunde löschen"
                        onClick={e => { e.stopPropagation(); setConfirmDelete(c) }}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}

            {total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {rangeStart}–{rangeEnd} von {total}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    ← Zurück
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 90, textAlign: 'center' }}>
                    Seite {page} / {totalPages}
                  </span>
                  <button
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Weiter →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Kunde löschen?"
          message={<>«{confirmDelete.name}» wird dauerhaft gelöscht. Bestehende Projekte bleiben erhalten.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={deleting}
          variant="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete()}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}
