import { useEffect, useRef, useState } from 'react'
import {
  addCustomerComment, availableSalutations, checkCustomerName,
  deleteCustomerComment, getCustomerComments, saveCustomer, updateCustomerComment,
} from '../../api/admin/customers'
import type { Customer, CustomerComment, CustomerNameMatch } from '../../api/admin/customers'
import { getMe } from '../../api/auth'
import type { UserInfo } from '../../api/auth'
import { hasModule, isFeatureEnabled } from '../../api/modules'
import { AddressAutocomplete } from '../../shared/AddressAutocomplete'
import { CompanySearch } from '../../shared/CompanySearch'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDateTime } from '../utils/format'
import {
  composeCustomerName, initialNameParts, isUnsplitCustomer, suggestNameSplits,
} from './customerNameParts'
import type { CustomerPrefill } from './customerPrefill'
import { kontaktVorbefuellung, type KontaktErgaenzung } from './customerErgaenzung'
import { CustomerProjects } from './CustomerProjects'
import { ReminderPanel } from '../reminders/ReminderPanel'

// Die Kundenmaske des Kundenstamms. Eigene Datei, seit sie auch aus der
// Projektmaske heraus aufgeht (WW-71, «Neuer Kunde» im Kundenfeld): dort als
// Dialog über dem Projekt, damit niemand das Projekt erst halb speichern, in
// den Kundenstamm wechseln und es danach wieder suchen muss. Es ist dieselbe
// Maske mit denselben Feldern und demselben Dubletten-Hinweis — eine zweite,
// schlankere Erfassung liefe mit der Zeit auseinander.

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
                <div key={c.id} style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
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
export function CustomerForm({
  initial,
  prefill,
  ergaenzung,
  variant = 'page',
  onSave,
  onCancel,
  onOpenProject,
}: {
  initial: Customer | null
  /**
   * Nur für einen neuen Kunden: Startwerte aus dem, was im Kundenfeld der
   * Projektmaske schon getippt war (customerPrefill.ts) — wer «Muster» sucht
   * und nichts findet, soll «Muster» nicht ein zweites Mal tippen.
   */
  prefill?: CustomerPrefill
  /**
   * Nur für einen bestehenden Kunden: ein Kontakt-Vorschlag aus dem Mail-Eingang.
   * Er füllt sein Feld vor, wenn es leer ist — sonst bleibt es stehen und ein
   * Hinweis nennt den Vorschlag (customerErgaenzung.ts).
   */
  ergaenzung?: KontaktErgaenzung
  /**
   * 'page' = im Kundenstamm (Karte mit «← Zurück»), 'dialog' = über der
   * Projektmaske bzw. dem Eingang: ohne eigene Karte und ohne Zurück-Knopf, der
   * Rahmen gehört dem Dialog.
   */
  variant?: 'page' | 'dialog'
  /** Der gespeicherte Kunde, wie der Server ihn zurückgibt (mit id). */
  onSave: (saved: Customer) => void
  onCancel: () => void
  onOpenProject?: (projectId: string) => void
}) {
  const isNew = !initial
  const isDialog = variant === 'dialog'
  const seed = isNew ? prefill : undefined
  const ergaenzt = kontaktVorbefuellung(initial, ergaenzung)
  // Vor- und Nachname getrennt (WF-5). `name` ist nur noch die Vorschau dessen,
  // was der Server daraus baut — er setzt ihn beim Speichern selbst.
  const initialParts = initialNameParts(initial)
  const [firstName, setFirstName] = useState(initialParts.first)
  const [lastName, setLastName] = useState(seed?.last_name ?? initialParts.last)
  const name = composeCustomerName(firstName, lastName)
  // Ein Name in einem Feld — Altbestand von vor WF-5 oder der Suchtext aus der
  // Projektmaske («Hans Muster»): Hinweis + Aufteil-Vorschlag, solange der
  // Erfasser die Felder noch nicht selbst angefasst hat.
  const unsplitName = initial
    ? (isUnsplitCustomer(initial) ? initial.name.trim() : '')
    : (seed?.last_name?.trim() ?? '')
  const unsplit = !!unsplitName && !firstName.trim() && lastName.trim() === unsplitName
  const splits = unsplit ? suggestNameSplits(unsplitName) : []
  // Anrede: '' = keine (Firmen, Verwaltungen). Gehalten wird der Schlüssel
  // ('herr'/'frau'/'frau_und_herr'), nicht die Druckform — die baut das PDF selbst.
  const [salutation, setSalutation] = useState(initial?.salutation ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [email, setEmail] = useState(seed?.email ?? ergaenzt?.werte.email ?? initial?.email ?? '')
  // Zusatzadressen: Formular-Zeilen (Label + Adresse); leere Zeilen filtert der Submit.
  const [additionalEmails, setAdditionalEmails] = useState<{ email: string; label: string }[]>(
    (initial?.additional_emails ?? []).map(a => ({ email: a.email, label: a.label ?? '' }))
  )
  const [phone, setPhone] = useState(seed?.phone ?? ergaenzt?.werte.phone ?? initial?.phone ?? '')
  const [phoneLandline, setPhoneLandline] = useState(seed?.phone_landline ?? ergaenzt?.werte.phone_landline ?? initial?.phone_landline ?? '')
  const [address, setAddress] = useState(seed?.address ?? initial?.address ?? '')
  const initialBillingDiffers = !!(initial?.billing_name || initial?.billing_address)
  const [billingDiffers, setBillingDiffers] = useState(initialBillingDiffers)
  const [billingName, setBillingName] = useState(initial?.billing_name ?? '')
  const [billingAddress, setBillingAddress] = useState(initial?.billing_address ?? '')
  const [objectAddress, setObjectAddress] = useState(initial?.object_address ?? '')
  const [localContactName, setLocalContactName] = useState(initial?.local_contact_name ?? '')
  const [localContactPhone, setLocalContactPhone] = useState(initial?.local_contact_phone ?? '')
  const [ownerContactName, setOwnerContactName] = useState(initial?.owner_contact_name ?? '')
  const [ownerContactPhone, setOwnerContactPhone] = useState(initial?.owner_contact_phone ?? '')
  const [me, setMe] = useState<UserInfo | null>(null)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nameMatches, setNameMatches] = useState<CustomerNameMatch[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const nameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getMe().then(setMe).catch(() => {})
  }, [])

  const showOwnerContact = isFeatureEnabled(me, 'eigentuemer_kontakt')
  // Anrede-Auswahl kommt vom Flag (`anrede_frau_und_herr`) — die gespeicherte
  // Anrede des Kunden bleibt darin, auch wenn ihr Flag inzwischen aus ist.
  const salutations = availableSalutations(me, initial?.salutation)

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
  // Im Dialog steht es ohnehin vorne; dort würde nur die Projektmaske dahinter
  // mitrollen.
  useEffect(() => {
    if (!isDialog) rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [isDialog])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lastName.trim()) return
    setError('')
    setSaving(true)
    try {
      const saved = await saveCustomer({
        name,
        first_name: firstName.trim() || null,
        last_name: lastName.trim(),
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
      onSave(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={isDialog ? undefined : 'admin-table-wrap'}
      style={isDialog ? undefined : { padding: 24, marginBottom: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        {!isDialog && (
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={onCancel}
            title="Zurück zur Übersicht"
          >
            ← Zurück
          </button>
        )}
        <div className="admin-section-title" style={{ margin: 0 }}>
          {isNew ? 'Neuer Kunde' : 'Kunde bearbeiten'}
        </div>
      </div>
      {isDialog && isNew && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Wird im Kundenstamm gespeichert und gleich als Kunde dieses Projekts gewählt.
        </div>
      )}
      {ergaenzt && (
        <div className="admin-form-hint-warn" role="note" data-testid="customer-ergaenzung">{ergaenzt.hinweis}</div>
      )}
      {error && <div className="admin-form-error">{error}</div>}
      {/* Gibt es für diesen Kunden schon ein Projekt? (WF-3) — oben, weil es
          meist die erste Frage ist, mit der man die Seite öffnet. */}
      {!isNew && initial && (
        <CustomerProjects customerId={initial.id} onOpenProject={onOpenProject} />
      )}
      {!isNew && initial && hasModule(me, 'reminders') && (
        <ReminderPanel target={{ customerId: initial.id }} me={me} />
      )}
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
        <div className="admin-form-group">
          {/* Anrede, Vorname und Nachname in EINER Zeile: die Anrede gehört zum
              Namen und steht im Empfängerblock von Offerte und Rechnung direkt
              über ihm. Flex statt admin-form-row, damit der Dubletten-Hinweis
              unten am Namen hängen bleibt. Vor- und Nachname sind getrennt, seit
              jeder Erfasser seine eigene Reihenfolge hatte (WF-5); gedruckt
              wird immer «Vorname Nachname». */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* 150px statt 110: «Frau und Herr» (Flag anrede_frau_und_herr) wird
                im geschlossenen Select sonst abgeschnitten. */}
            <div style={{ flex: '0 0 150px' }}>
              <label className="admin-form-label" htmlFor="customer-salutation">Anrede</label>
              <select
                id="customer-salutation"
                className="admin-form-input"
                value={salutation}
                onChange={e => setSalutation(e.target.value)}
              >
                <option value="">—</option>
                {salutations.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label className="admin-form-label" htmlFor="customer-first-name">Vorname</label>
              <input
                id="customer-first-name"
                className="admin-form-input"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <label className="admin-form-label" htmlFor="customer-last-name">Nachname / Bezeichnung *</label>
              <input
                id="customer-last-name"
                className="admin-form-input"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                required
                // Im Dialog sitzt der Fokus sonst noch im Kundenfeld hinter dem Overlay.
                autoFocus={isDialog}
                autoComplete="off"
                aria-describedby={nameMatches.length > 0 ? 'customer-name-duplicates' : undefined}
              />
            </div>
          </div>
          {/* Beim Suchtext aus der Projektmaske nur mit Vorschlag: «Muster» oder
              «Huber GmbH» brauchen keinen Hinweis, «Hans Muster» schon. */}
          {unsplit && (initial || splits.length > 0) && (
            <div className="admin-form-hint" role="note" data-testid="customer-name-unsplit">
              {initial
                ? <>Dieser Kunde wurde noch mit einem einzigen Namensfeld erfasst
                    («{initial.name}»). Steht darin auch ein Vorname, gehört er ins Feld «Vorname».</>
                : <>Übernommen aus der Suche: «{unsplitName}». Steht darin auch ein Vorname,
                    gehört er ins Feld «Vorname».</>}
              {splits.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {splits.map(sp => (
                    <button
                      key={`${sp.first}|${sp.last}`}
                      type="button"
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => { setFirstName(sp.first); setLastName(sp.last) }}
                    >
                      Vorname «{sp.first}», Nachname «{sp.last}»
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-form-label">Firma</label>
            <input className="admin-form-input" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">E-Mail</label>
            <input className="admin-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
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
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !lastName.trim()}>
            {saving ? 'Speichern…' : isDialog && isNew ? 'Anlegen und übernehmen' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}
