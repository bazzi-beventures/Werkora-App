import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listAllCustomers, saveCustomer } from '../../api/admin/customers'
import { WORK_TYPES, type WorkType } from '../../api/workTypes'
import { findCustomerMatch, normalize } from './customerMatch'

/**
 * «In Projekt umwandeln» — die Maske, die aus Angaben von aussen ein Projekt macht.
 *
 * Zwei Aufrufer: der Entwurf (ProjectDraftsScreen, Monteur-Erfassung und
 * öffentliche Anfrage) und die neue Anfrage im Mail-Eingang
 * (eingang/ProjektAusMail.tsx, docs/specs/mail-eingang-aufgaben-antworten.md
 * §10/1). Dieselbe Maske, damit beide Wege dieselben Felder und dieselbe
 * Kundenzuordnung haben.
 *
 * **Kunde:** nur ein exakt gleicher Name wird vorgewählt; ein bloss ähnlicher
 * erscheint als Vorschlag und braucht einen Klick — ein still verknüpfter
 * falscher Kunde landet sonst auf der Rechnung. Ist der Kunde schon bekannt
 * (`start.kundeId`), steht er gewählt da. «Neuen Kunden anlegen» speichert ihn
 * erst mit «Projekt erstellen»; scheitert danach das Projekt, bleibt er als
 * gewählter Kunde stehen, damit ein zweiter Versuch keinen zweiten anlegt.
 */

interface KundeKurz {
  id: string
  name: string
  address: string | null
}

export interface ProjektStart {
  projectName: string
  objectName: string
  objectAddress: string
  contactName: string
  contactPhone: string
  artDerArbeit: readonly string[]
  /** Vorbelegung für «Neuen Kunden anlegen». */
  kundeName: string
  kundePhone: string
  kundeEmail: string
  kundeAddress: string
  /** Schon bekannter Kunde — steht gewählt da. */
  kundeId?: string | null
}

export interface ProjektWerte {
  project_name: string
  customer_id: string | null
  object_name: string | null
  object_address: string | null
  site_contact_name: string | null
  site_contact_phone: string | null
  art_der_arbeit: WorkType[]
}

interface Props {
  start: ProjektStart
  /** Woher die Vorbelegung des neuen Kunden stammt («aus dem Entwurf», «aus der Mail»). */
  quelle: string
  /** Satz unter der Maske: was sonst noch ins Projekt übernommen wird. */
  fussnote: string
  onErstellen: (werte: ProjektWerte) => Promise<void>
  /** Weitere Knöpfe neben «Projekt erstellen» (z.B. Verwerfen); `busy` sperrt sie mit. */
  zusatzAktion?: (busy: boolean) => ReactNode
}

const feldStil = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' } as const

export default function ProjektAnlegenFormular({ start, quelle, fussnote, onErstellen, zusatzAktion }: Props) {
  const [projectName, setProjectName] = useState(start.projectName)
  const [objectName, setObjectName] = useState(start.objectName)
  const [objectAddress, setObjectAddress] = useState(start.objectAddress)
  const [contactName, setContactName] = useState(start.contactName)
  const [contactPhone, setContactPhone] = useState(start.contactPhone)
  // Kanonische Reihenfolge, unbekannte Alt-Werte fallen dabei raus.
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>(
    () => WORK_TYPES.map(w => w.value).filter(v => start.artDerArbeit.includes(v)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [customers, setCustomers] = useState<KundeKurz[] | null>(null)
  const [customerMode, setCustomerMode] = useState<'existing' | 'new' | 'none'>(start.kundeId ? 'existing' : 'new')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(start.kundeId ?? '')
  const [newCustName, setNewCustName] = useState(start.kundeName)
  const [newCustPhone, setNewCustPhone] = useState(start.kundePhone)
  const [newCustEmail, setNewCustEmail] = useState(start.kundeEmail)
  const [newCustAddress, setNewCustAddress] = useState(start.kundeAddress)
  const [customerSearch, setCustomerSearch] = useState('')

  useEffect(() => {
    let aktiv = true
    listAllCustomers()
      .then(list => {
        if (!aktiv) return
        setCustomers(list)
        if (start.kundeId) {
          const bekannt = list.find(c => String(c.id) === String(start.kundeId))
          if (bekannt) setCustomerSearch(bekannt.name)
          return
        }
        const match = findCustomerMatch(start.kundeName, list)
        if (match?.exact) {
          setCustomerMode('existing')
          setSelectedCustomerId(match.customer.id)
          setCustomerSearch(match.customer.name)
        }
      })
      .catch(() => { if (aktiv) setCustomers([]) })
    return () => { aktiv = false }
  }, [start.kundeId, start.kundeName])

  const filteredCustomers = useMemo(() => {
    if (!customers) return []
    const q = normalize(customerSearch)
    if (!q) return customers.slice(0, 50)
    return customers.filter(c => normalize(c.name).includes(q)).slice(0, 50)
  }, [customers, customerSearch])

  const fuzzyMatch = useMemo(
    () => customers && !start.kundeId ? findCustomerMatch(start.kundeName, customers)?.customer ?? null : null,
    [customers, start.kundeName, start.kundeId],
  )

  function toggleArt(value: string) {
    setArtDerArbeit(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

  async function erstellen() {
    setError('')
    if (!projectName.trim()) { setError('Projektname ist erforderlich.'); return }
    let customerId: string | null = null
    if (customerMode === 'existing') {
      if (!selectedCustomerId) { setError('Bitte einen Kunden aus dem Stamm wählen.'); return }
      customerId = selectedCustomerId
    } else if (customerMode === 'new' && !newCustName.trim()) {
      setError('Name des neuen Kunden ist erforderlich.'); return
    }
    setBusy(true)
    try {
      if (customerMode === 'new') {
        const neu = await saveCustomer({
          name: newCustName.trim(),
          email: newCustEmail.trim() || null,
          phone: newCustPhone.trim() || null,
          address: newCustAddress.trim() || null,
        })
        customerId = neu.id
        // Steht der Kunde, bleibt er gewählt — ein zweiter Versuch legt keinen zweiten an.
        setCustomers(prev => [{ id: neu.id, name: neu.name, address: neu.address }, ...(prev ?? [])])
        setCustomerMode('existing')
        setSelectedCustomerId(neu.id)
        setCustomerSearch(neu.name)
      }
      await onErstellen({
        project_name: projectName.trim(),
        customer_id: customerId,
        object_name: objectName.trim() || null,
        object_address: objectAddress.trim() || null,
        site_contact_name: contactName.trim() || null,
        site_contact_phone: contactPhone.trim() || null,
        art_der_arbeit: WORK_TYPES.map(w => w.value).filter(v => artDerArbeit.includes(v)),
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Anlegen des Projekts.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>In Projekt umwandeln</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={feldStil}>
            <span>Projektname *</span>
            <input type="text" className="admin-input" value={projectName}
                   onChange={e => setProjectName(e.target.value)} />
          </label>
          <label style={feldStil}>
            <span>Objekt-Name (optional)</span>
            <input type="text" className="admin-input" value={objectName}
                   onChange={e => setObjectName(e.target.value)} placeholder="z.B. MFH Sonnhalde" />
          </label>
          <label style={feldStil}>
            <span>Objekt-Adresse</span>
            <input type="text" className="admin-input" value={objectAddress}
                   onChange={e => setObjectAddress(e.target.value)} />
          </label>
          <div className="admin-form-row">
            <label style={feldStil}>
              <span>Ansprechpartner vor Ort</span>
              <input type="text" className="admin-input" value={contactName}
                     onChange={e => setContactName(e.target.value)} />
            </label>
            <label style={feldStil}>
              <span>Telefon</span>
              <input type="text" className="admin-input" value={contactPhone}
                     onChange={e => setContactPhone(e.target.value)} />
            </label>
          </div>
          <div style={feldStil}>
            <span>Art der Arbeit (Mehrfachauswahl)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
              {WORK_TYPES.map(t => {
                const active = artDerArbeit.includes(t.value)
                return (
                  <label
                    key={t.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      fontSize: 13, padding: '4px 10px', borderRadius: 'var(--radius-xs)',
                      background: active ? 'var(--primary)' : 'var(--surface-2)',
                      color: active ? '#fff' : 'var(--text)',
                      border: '1px solid', borderColor: active ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    <input type="checkbox" style={{ display: 'none' }} checked={active}
                           onChange={() => toggleArt(t.value)} />
                    {t.label}
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── Kunden-Verknüpfung ── */}
          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Kunde</div>

            {fuzzyMatch && customerMode !== 'existing' && (
              <div
                style={{
                  background: 'var(--accent-amber-dim, rgba(245,158,11,0.12))',
                  border: '1px solid rgba(245,158,11,0.4)',
                  borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                  fontSize: 12, marginBottom: 8,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setCustomerMode('existing')
                  setSelectedCustomerId(fuzzyMatch.id)
                  setCustomerSearch(fuzzyMatch.name)
                }}
              >
                💡 Möglicher Treffer im Kundenstamm: <strong>{fuzzyMatch.name}</strong>
                {fuzzyMatch.address ? ` — ${fuzzyMatch.address}` : ''} — klicken zum Übernehmen
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['existing', 'new', 'none'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`admin-btn ${customerMode === mode ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => setCustomerMode(mode)}
                >
                  {mode === 'existing' ? 'Aus Stamm wählen' : mode === 'new' ? 'Neuen Kunden anlegen' : 'Ohne Kunde'}
                </button>
              ))}
            </div>

            {customerMode === 'existing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input type="text" className="admin-input" placeholder="Kunden suchen…" value={customerSearch}
                       onChange={e => setCustomerSearch(e.target.value)} />
                <select
                  className="admin-input"
                  size={Math.min(6, Math.max(3, filteredCustomers.length || 3))}
                  value={selectedCustomerId}
                  onChange={e => {
                    setSelectedCustomerId(e.target.value)
                    const c = filteredCustomers.find(x => x.id === e.target.value)
                    if (c) setCustomerSearch(c.name)
                  }}
                  style={{ height: 'auto' }}
                >
                  {customers === null && <option>Lade Kunden…</option>}
                  {customers !== null && filteredCustomers.length === 0 && <option disabled>Keine Treffer</option>}
                  {filteredCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.address ? ` — ${c.address}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {customerMode === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Vorausgefüllt {quelle} — bei Bedarf vor dem Anlegen korrigieren.
                </div>
                <label style={feldStil}>
                  <span>Name *</span>
                  <input type="text" className="admin-input" value={newCustName}
                         onChange={e => setNewCustName(e.target.value)} />
                </label>
                <div className="admin-form-row">
                  <label style={feldStil}>
                    <span>Telefon</span>
                    <input type="text" className="admin-input" value={newCustPhone}
                           onChange={e => setNewCustPhone(e.target.value)} />
                  </label>
                  <label style={feldStil}>
                    <span>E-Mail</span>
                    <input type="email" className="admin-input" value={newCustEmail}
                           onChange={e => setNewCustEmail(e.target.value)} />
                  </label>
                </div>
                <label style={feldStil}>
                  <span>Adresse</span>
                  <input type="text" className="admin-input" value={newCustAddress}
                         onChange={e => setNewCustAddress(e.target.value)} />
                </label>
              </div>
            )}

            {customerMode === 'none' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Projekt wird ohne Kunden-Verknüpfung erstellt. Die Angaben zum Kunden werden als Bemerkung übernommen.
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fussnote}</div>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="admin-btn admin-btn-primary" style={{ flex: 1 }} disabled={busy}
                onClick={() => void erstellen()}>
          {busy ? 'Erstelle…' : 'Projekt erstellen'}
        </button>
        {zusatzAktion?.(busy)}
      </div>
    </>
  )
}
