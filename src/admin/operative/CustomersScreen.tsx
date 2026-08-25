import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SALUTATIONS, addCustomerComment, checkCustomerName, deleteCustomer, deleteCustomerComment,
  getCustomerComments, listCustomers, salutationLabel, saveCustomer, updateCustomerComment,
} from '../../api/admin/customers'
import type {
  AdditionalEmail, Customer, CustomerComment, CustomerNameMatch, CustomersListResponse,
} from '../../api/admin/customers'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import { AddressAutocomplete } from '../../shared/AddressAutocomplete'
import { CompanySearch } from '../../shared/CompanySearch'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { formatDateTime } from '../utils/format'
import { useToast, ToastHost } from '../components/useToast'

function CustomerComments({ customerId }: { customerId: string }) {
  const [comments, setComments] = useState<CustomerComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      setComments(await getCustomerComments(customerId))
    } catch {
      setComments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [customerId])

  async function handleAdd() {
    if (!newComment.trim()) return
    setAdding(true); setError('')
    try {
      await addCustomerComment(customerId, newComment.trim())
      setNewComment('')
      await load()
    } catch {
      setError('Fehler beim Speichern des Kommentars')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(c: CustomerComment) {
    setEditingId(c.id)
    setEditingText(c.text)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingText('')
  }

  async function handleSaveEdit() {
    if (!editingId || !editingText.trim()) return
    setSavingEdit(true); setError('')
    try {
      await updateCustomerComment(customerId, editingId, editingText.trim())
      cancelEdit()
      await load()
    } catch {
      setError('Fehler beim Aktualisieren des Kommentars')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return
    setDeleting(true); setError('')
    try {
      await deleteCustomerComment(customerId, confirmDeleteId)
      setComments(prev => prev.filter(c => c.id !== confirmDeleteId))
      setConfirmDeleteId(null)
    } catch {
      setError('Fehler beim Löschen des Kommentars')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-form-group">
      <label className="admin-form-label">Kommentare</label>
      {error && <div className="admin-form-error" style={{ marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Laden…</div>
      ) : (
        <>
          {comments.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>Noch keine Kommentare.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {comments.map(c => {
              const isEditing = editingId === c.id
              return (
                <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author_name || 'Unbekannt'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {formatDateTime(c.created_at)}
                        {c.updated_at ? ' · bearbeitet' : ''}
                      </span>
                      {!isEditing && (
                        <>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => startEdit(c)}
                          >Bearbeiten</button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() => setConfirmDeleteId(c.id)}
                          >Löschen</button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="admin-form-input"
                        rows={2}
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        style={{ resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >Abbrechen</button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-primary"
                          onClick={handleSaveEdit}
                          disabled={savingEdit || !editingText.trim()}
                        >{savingEdit ? 'Speichern…' : 'Speichern'}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="admin-form-input"
              style={{ flex: 1 }}
              placeholder="Kommentar hinzufügen…"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAdd() } }}
            />
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={adding || !newComment.trim()}
              onClick={handleAdd}
            >
              {adding ? '…' : 'Speichern'}
            </button>
          </div>
        </>
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          title="Kommentar löschen?"
          message={<>Der Kommentar wird dauerhaft entfernt.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={deleting}
          variant="danger"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

// Zusatz-E-Mail-Adresse (reine Stammdaten — kein Versand-Feature; Hauptadresse bleibt email).
function CustomerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Customer | null
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = !initial
  const [name, setName] = useState(initial?.name ?? '')
  // Anrede: '' = keine (Firmen, Verwaltungen). Gehalten wird der Schlüssel
  // ('herr'/'frau'), nicht die Druckform — die baut das PDF selbst.
  const [salutation, setSalutation] = useState(initial?.salutation ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  // Zusatzadressen: Formular-Zeilen (Label + Adresse); leere Zeilen filtert der Submit.
  const [additionalEmails, setAdditionalEmails] = useState<{ email: string; label: string }[]>(
    (initial?.additional_emails ?? []).map(a => ({ email: a.email, label: a.label ?? '' }))
  )
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [phoneLandline, setPhoneLandline] = useState(initial?.phone_landline ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const initialBillingDiffers = !!(initial?.billing_name || initial?.billing_address)
  const [billingDiffers, setBillingDiffers] = useState(initialBillingDiffers)
  const [billingName, setBillingName] = useState(initial?.billing_name ?? '')
  const [billingAddress, setBillingAddress] = useState(initial?.billing_address ?? '')
  const [objectAddress, setObjectAddress] = useState(initial?.object_address ?? '')
  const [localContactName, setLocalContactName] = useState(initial?.local_contact_name ?? '')
  const [localContactPhone, setLocalContactPhone] = useState(initial?.local_contact_phone ?? '')
  const [ownerContactName, setOwnerContactName] = useState(initial?.owner_contact_name ?? '')
  const [ownerContactPhone, setOwnerContactPhone] = useState(initial?.owner_contact_phone ?? '')
  const [showOwnerContact, setShowOwnerContact] = useState(false)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nameMatches, setNameMatches] = useState<CustomerNameMatch[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const nameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getMe().then(me => setShowOwnerContact(isFeatureEnabled(me, 'eigentuemer_kontakt'))).catch(() => {})
  }, [])

  // Dubletten-Hinweis: Gleiche Kundennamen sind erlaubt (der Unique-Constraint auf
  // dem Namen ist bewusst weggefallen — «Hans Müller» gibt es nun mal mehrfach).
  // Deshalb wird hier nur informiert, nie blockiert: wer den Namen tippt, sieht
  // die bereits vorhandenen Träger samt Adresse und entscheidet selbst.
  useEffect(() => {
    if (nameCheckRef.current) clearTimeout(nameCheckRef.current)
    const needle = name.trim()
    if (!needle) {
      setNameMatches([])
      return
    }
    nameCheckRef.current = setTimeout(async () => {
      try {
        setNameMatches(await checkCustomerName(needle, initial?.id))
      } catch {
        // Rein informativ — ein fehlgeschlagener Check darf das Formular nicht stören.
        setNameMatches([])
      }
    }, 400)
    return () => { if (nameCheckRef.current) clearTimeout(nameCheckRef.current) }
  }, [name, initial?.id])

  // Beim Klick auf eine Zeile weit unten in der Liste öffnet sich das
  // Formular oberhalb des Sichtbereichs — deshalb beim Mounten hinscrollen.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      await saveCustomer({
        name: name.trim(),
        // null statt '' — der Server macht daraus ein echtes Leeren des Feldes,
        // '' verstiesse gegen den CHECK auf der Spalte.
        salutation: salutation || null,
        company: company.trim() || null,
        email: email || null,
        // Immer senden (auch []), damit Entfernen aller Zusatzadressen gespeichert wird.
        additional_emails: additionalEmails
          .map(a => ({ email: a.email.trim(), label: a.label.trim() || null }))
          .filter(a => a.email),
        phone: phone || null,
        phone_landline: phoneLandline || null,
        address: address || null,
        billing_name: billingDiffers ? (billingName.trim() || null) : null,
        billing_address: billingDiffers ? (billingAddress || null) : null,
        object_address: objectAddress || null,
        local_contact_name: localContactName.trim() || null,
        local_contact_phone: localContactPhone.trim() || null,
        ...(showOwnerContact ? {
          owner_contact_name: ownerContactName.trim() || null,
          owner_contact_phone: ownerContactPhone.trim() || null,
        } : {}),
        notes: notes || null,
      }, isNew ? undefined : initial!.id)
      onSave()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={rootRef} className="admin-table-wrap" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={onCancel}
          title="Zurück zur Übersicht"
        >
          ← Zurück
        </button>
        <div className="admin-section-title" style={{ margin: 0 }}>
          {isNew ? 'Neuer Kunde' : 'Kunde bearbeiten'}
        </div>
      </div>
      {error && <div className="admin-form-error">{error}</div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        <div className="admin-form-group">
          <label className="admin-form-label">Firma suchen via search.ch</label>
          <CompanySearch
            onSelect={result => {
              if (result.name) setCompany(result.name)
              if (result.address) setAddress(result.address)
              if (result.phone) setPhoneLandline(result.phone)
              if (result.email) setEmail(result.email)
            }}
          />
        </div>
        <div className="admin-form-row">
          <div className="admin-form-group">
            {/* Anrede und Name in EINER Zeile: die Anrede gehört zum Namen und
                steht im Empfängerblock von Offerte und Rechnung direkt über ihm.
                Flex statt einer eigenen admin-form-row, damit der Dubletten-
                Hinweis unten am Namensfeld hängen bleibt und die Anrede nicht
                die halbe Zeilenbreite bekommt. */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: '0 0 110px' }}>
                <label className="admin-form-label" htmlFor="customer-salutation">Anrede</label>
                <select
                  id="customer-salutation"
                  className="admin-form-input"
                  value={salutation}
                  onChange={e => setSalutation(e.target.value)}
                >
                  <option value="">—</option>
                  {SALUTATIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className="admin-form-label" htmlFor="customer-name">Name *</label>
                <input
                  id="customer-name"
                  className="admin-form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  aria-describedby={nameMatches.length > 0 ? 'customer-name-duplicates' : undefined}
                />
              </div>
            </div>
            {nameMatches.length > 0 && (
              <div className="admin-form-hint-warn" role="status" id="customer-name-duplicates">
                <div className="admin-form-hint-lead">
                  {nameMatches.length === 1
                    ? 'Es gibt bereits einen Kunden mit diesem Namen:'
                    : `Es gibt bereits ${nameMatches.length} Kunden mit diesem Namen:`}
                </div>
                <ul>
                  {nameMatches.map(m => (
                    <li key={m.id}>
                      {[m.company, m.billing_address ?? m.address].filter(Boolean).join(' · ') || 'ohne weitere Angaben'}
                    </li>
                  ))}
                </ul>
                <div className="admin-form-hint-foot">
                  Gleiche Namen sind erlaubt — speichern legt einen weiteren Kunden an.
                </div>
              </div>
            )}
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Firma</label>
            <input className="admin-form-input" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">E-Mail</label>
          <input className="admin-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        {/* Zusatzadressen: reine Stammdaten (erfassen/anzeigen) — der Versand nutzt
            weiterhin die Hauptadresse; bei Bedarf kopiert man eine Zusatzadresse
            ins freie Empfängerfeld des Versand-Dialogs. */}
        <div className="admin-form-group">
          <label className="admin-form-label">Weitere E-Mail-Adressen</label>
          {additionalEmails.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input
                className="admin-form-input"
                style={{ flex: '0 1 180px', minWidth: 0 }}
                placeholder="Bezeichnung (z.B. Buchhaltung)"
                value={a.label}
                onChange={e => setAdditionalEmails(list => list.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
              />
              <input
                className="admin-form-input"
                style={{ flex: 1, minWidth: 0 }}
                type="email"
                placeholder="adresse@firma.ch"
                value={a.email}
                onChange={e => setAdditionalEmails(list => list.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
              />
              <button
                type="button"
                className="admin-btn-icon danger"
                title="Adresse entfernen"
                onClick={() => setAdditionalEmails(list => list.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setAdditionalEmails(list => [...list, { email: '', label: '' }])}
          >
            + Adresse
          </button>
        </div>
        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-form-label">Mobil</label>
            <input className="admin-form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="079 123 45 67" />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Festnetz</label>
            <input className="admin-form-input" value={phoneLandline} onChange={e => setPhoneLandline(e.target.value)} placeholder="044 123 45 67" />
          </div>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Adresse (Kontakt / Standard)</label>
          <AddressAutocomplete className="admin-form-input" value={address} onChange={setAddress} />
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={billingDiffers}
              onChange={e => setBillingDiffers(e.target.checked)}
            />
            Abweichende Rechnungsadresse
          </label>
          {billingDiffers && (
            <div className="admin-form-row" style={{ marginTop: 10 }}>
              <div>
                <label className="admin-form-label">Empfänger (Rechnung)</label>
                <input className="admin-form-input" value={billingName} onChange={e => setBillingName(e.target.value)} placeholder={name || 'z.B. Verwaltung AG'} />
              </div>
              <div>
                <label className="admin-form-label">Rechnungsadresse</label>
                <AddressAutocomplete className="admin-form-input" value={billingAddress} onChange={setBillingAddress} />
              </div>
            </div>
          )}
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label">Standard-Objektadresse (optional)</label>
          <AddressAutocomplete className="admin-form-input" value={objectAddress} onChange={setObjectAddress} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Wird beim Anlegen neuer Projekte als Vorschlag übernommen und kann pro Projekt überschrieben werden.
          </div>
        </div>

        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-form-label">Lokaler Kontakt — Name (Default)</label>
            <input className="admin-form-input" value={localContactName} onChange={e => setLocalContactName(e.target.value)} placeholder="z.B. Hauswart" />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Lokaler Kontakt — Telefon</label>
            <input className="admin-form-input" value={localContactPhone} onChange={e => setLocalContactPhone(e.target.value)} />
          </div>
        </div>

        {showOwnerContact && (
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-form-label">Eigentümer — Name</label>
              <input className="admin-form-input" value={ownerContactName} onChange={e => setOwnerContactName(e.target.value)} placeholder="z.B. Eigentümer / Verwaltung" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Eigentümer — Telefon</label>
              <input className="admin-form-input" value={ownerContactPhone} onChange={e => setOwnerContactPhone(e.target.value)} />
            </div>
          </div>
        )}

        <div className="admin-form-group">
          <label className="admin-form-label">Notizen</label>
          <textarea
            className="admin-form-input"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {!isNew && initial && <CustomerComments customerId={initial.id} />}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}

const PAGE_SIZE = 50

export default function CustomersScreen() {
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
