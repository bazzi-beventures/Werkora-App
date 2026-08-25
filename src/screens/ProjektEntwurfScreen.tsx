import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, isNetworkError } from '../api/client'
import { createProjectDraft, ProjectDraftPayload } from '../api/projectDrafts'
import { AddressAutocomplete } from '../shared/AddressAutocomplete'
import { CompanySearch, CompanyResult } from '../shared/CompanySearch'
import { WORK_TYPES } from '../api/workTypes'

const OFFLINE_QUEUE_KEY = 'projektEntwurf_offline_queue'

// Siehe ArbeitsZeitScreen für die Begründung (Bevenetures-Origin-Wechsel).
const MAX_DRAIN_ATTEMPTS = 10

interface QueuedDraft {
  payload: ProjectDraftPayload
  queued_at: string
  attempts?: number
}

function loadQueue(): QueuedDraft[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]') } catch { return [] }
}

function saveQueue(q: QueuedDraft[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q))
}

interface MaterialRow {
  name: string
  quantity: string
}

interface Props {
  logoUrl?: string
  onNavHome: () => void
  onLoggedOut: () => void
}

const EMPTY_FORM: ProjectDraftPayload = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  customer_address: '',
  title: '',
  description: '',
  object_name: '',
  object_address: '',
  materials: [],
  notes: '',
  art_der_arbeit: [],
}

export default function ProjektEntwurfScreen({ logoUrl, onNavHome, onLoggedOut }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [objectName, setObjectName] = useState('')
  const [objectAddress, setObjectAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>([])
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)
  const [queueSize, setQueueSize] = useState(() => loadQueue().length)
  const [draining, setDraining] = useState(false)
  const [queueStuck, setQueueStuck] = useState(() =>
    loadQueue().some(it => (it.attempts ?? 0) >= MAX_DRAIN_ATTEMPTS),
  )

  // Re-Entrancy-Schutz: flatterndes Netz (mehrere online-Events kurz
  // hintereinander) darf keine zwei Drains parallel starten — sonst wird
  // jeder Entwurf doppelt gesendet.
  const drainingRef = useRef(false)

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return
    if (!navigator.onLine) return // chancenlos — würde nur attempts hochzählen
    const q = loadQueue()
    if (q.length === 0) return
    drainingRef.current = true
    setDraining(true)
    const remaining: QueuedDraft[] = []
    try {
      for (const item of q) {
        try {
          await createProjectDraft(item.payload)
        } catch {
          remaining.push({ ...item, attempts: (item.attempts ?? 0) + 1 })
        }
      }
    } finally {
      // Während des Drains kann handleSubmit neue Entwürfe angehängt haben
      // (reines Append, kein Dedup) — die dürfen nicht überschrieben werden.
      const merged = [...remaining, ...loadQueue().slice(q.length)]
      saveQueue(merged)
      setQueueSize(merged.length)
      setQueueStuck(merged.some(it => (it.attempts ?? 0) >= MAX_DRAIN_ATTEMPTS))
      setDraining(false)
      drainingRef.current = false
      if (merged.length === 0) {
        setResult({ text: 'Offline-Entwürfe wurden gesendet.', isError: false })
      }
    }
  }, [])

  useEffect(() => {
    if (navigator.onLine) { void drainQueue() }
    const onOnline = () => { void drainQueue() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drainQueue])

  function resetForm() {
    setTitle('')
    setDescription('')
    setObjectName('')
    setObjectAddress('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setCustomerAddress('')
    setNotes('')
    setArtDerArbeit([])
    setMaterials([])
  }

  function toggleArt(value: string) {
    setArtDerArbeit(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value],
    )
  }

  function addMaterial() {
    setMaterials(prev => [...prev, { name: '', quantity: '' }])
  }
  function updateMaterial(idx: number, patch: Partial<MaterialRow>) {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }
  function removeMaterial(idx: number) {
    setMaterials(prev => prev.filter((_, i) => i !== idx))
  }

  // Kunde aus tel.search.ch übernehmen — füllt Name/Adresse/Telefon/Mail vor,
  // alles bleibt danach manuell editierbar. Leere Felder überschreiben nichts.
  function applyCompany(r: CompanyResult) {
    if (r.name) setCustomerName(r.name)
    if (r.address) setCustomerAddress(r.address)
    if (r.phone) setCustomerPhone(r.phone)
    if (r.email) setCustomerEmail(r.email)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanTitle = title.trim()
    const cleanCustomer = customerName.trim()
    if (!cleanTitle || !cleanCustomer) {
      setResult({ text: 'Bitte mindestens Titel und Kundenname ausfüllen.', isError: true })
      return
    }
    const payload: ProjectDraftPayload = {
      ...EMPTY_FORM,
      title: cleanTitle,
      description: description.trim() || null,
      object_name: objectName.trim() || null,
      object_address: objectAddress.trim() || null,
      customer_name: cleanCustomer,
      customer_phone: customerPhone.trim() || null,
      customer_email: customerEmail.trim() || null,
      customer_address: customerAddress.trim() || null,
      notes: notes.trim() || null,
      // Kanonische Reihenfolge — der Server normalisiert ohnehin, aber die
      // Offline-Queue soll nicht je nach Klickreihenfolge anders aussehen.
      art_der_arbeit: WORK_TYPES.map(w => w.value).filter(v => artDerArbeit.includes(v)),
      materials: materials
        .filter(m => m.name.trim())
        .map(m => ({ name: m.name.trim(), quantity: m.quantity.trim() || null })),
    }

    setSubmitting(true)
    setResult(null)
    try {
      await createProjectDraft(payload)
      setResult({ text: 'Entwurf ans Büro gesendet. Der Projektleiter sieht ihn jetzt.', isError: false })
      resetForm()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      // isNetworkError statt isOfflineError: "verbunden, aber kein Durchkommen"
      // (Funkloch, Timeout) meldet navigator.onLine === true — auf der Baustelle
      // der Normalfall. Dauerfehler (CORS/Origin) fängt MAX_DRAIN_ATTEMPTS ab.
      if (isNetworkError(err)) {
        const q = loadQueue()
        q.push({ payload, queued_at: new Date().toISOString() })
        saveQueue(q)
        setQueueSize(q.length)
        setResult({ text: 'Offline gespeichert — wird automatisch gesendet sobald wieder Internet.', isError: false })
        resetForm()
      } else {
        const msg = err instanceof Error ? err.message : 'Fehler beim Senden.'
        setResult({ text: msg, isError: true })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Projekt-Entwurf</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      <div className="context-banner context-banner-amber">
        <div className="banner-tag banner-tag-amber">Vor Ort beim Kunden</div>
        <div className="banner-text">Erfasse einen neuen Auftrag als Entwurf. Der Projektleiter wandelt ihn dann in ein Projekt um.</div>
      </div>

      {result && (
        <div className={`action-result${result.isError ? ' action-result-error' : ''}`}>
          {result.text}
        </div>
      )}

      {queueSize > 0 && !queueStuck && (
        <div className="action-result" style={{ background: '#1e3a5f', color: '#93c5fd', borderLeft: '3px solid #3b82f6' }}>
          {draining
            ? `${queueSize} Entwurf${queueSize > 1 ? 'e werden' : ' wird'} synchronisiert…`
            : `${queueSize} Entwurf${queueSize > 1 ? 'e' : ''} offline gespeichert – wird gesendet sobald Verbindung vorhanden.`}
        </div>
      )}
      {queueStuck && (
        <div className="action-result action-result-error">
          {queueSize} Entwurf{queueSize > 1 ? 'e können' : ' kann'} nicht gesendet werden. Bitte App deinstallieren und neu installieren — Entwürfe danach erneut erfassen.
        </div>
      )}

      <form className="entwurf-form" onSubmit={handleSubmit} style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section className="entwurf-section">
          <div className="entwurf-section-title">Was ist zu tun?</div>
          <label className="entwurf-label">
            <span>Titel / Kurzbeschreibung *</span>
            <input
              type="text"
              className="entwurf-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z. B. Garagentor reparieren"
              required
            />
          </label>
          <label className="entwurf-label">
            <span>Details</span>
            <textarea
              className="entwurf-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Was genau soll gemacht werden?"
            />
          </label>
          {/* Leistungsart: der Monteur steht vor Ort und weiss, ob es eine
              Neumontage oder ein Service ist. Ohne dieses Feld musste der
              Projektleiter beim Umwandeln raten — meistens blieb es leer. */}
          <div className="entwurf-label">
            <span>Art der Arbeit (Mehrfachauswahl)</span>
            <div className="leistungsart-grid">
              {WORK_TYPES.map(w => (
                <button
                  key={w.value}
                  type="button"
                  aria-pressed={artDerArbeit.includes(w.value)}
                  className={`leistungsart-chip ${artDerArbeit.includes(w.value) ? 'is-selected' : ''}`}
                  onClick={() => toggleArt(w.value)}
                >
                  <span className="leistungsart-chip-check" aria-hidden="true">
                    {artDerArbeit.includes(w.value) ? '✓' : ''}
                  </span>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <label className="entwurf-label">
            <span>Objekt-Name (optional)</span>
            <input
              className="entwurf-input"
              value={objectName}
              onChange={e => setObjectName(e.target.value)}
              placeholder="z.B. MFH Sonnhalde oder Familie Muster"
            />
          </label>
          <label className="entwurf-label">
            <span>Objekt-Adresse (wo gearbeitet wird)</span>
            <AddressAutocomplete
              className="entwurf-input"
              value={objectAddress}
              onChange={setObjectAddress}
              placeholder="Strasse, PLZ Ort"
            />
          </label>
        </section>

        <section className="entwurf-section">
          <div className="entwurf-section-title">Kunde</div>
          <div className="entwurf-label">
            <span>Kunde suchen (search.ch)</span>
            <CompanySearch
              endpoint="/pwa/project-drafts/company-lookup"
              inputClassName="entwurf-input"
              onSelect={applyCompany}
            />
          </div>
          <label className="entwurf-label">
            <span>Name *</span>
            <input
              type="text"
              className="entwurf-input"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Vor- und Nachname oder Firma"
              required
            />
          </label>
          <label className="entwurf-label">
            <span>Telefon</span>
            <input
              type="tel"
              className="entwurf-input"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              inputMode="tel"
            />
          </label>
          <label className="entwurf-label">
            <span>E-Mail</span>
            <input
              type="email"
              className="entwurf-input"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              inputMode="email"
            />
          </label>
          <label className="entwurf-label">
            <span>Adresse Kunde</span>
            <AddressAutocomplete
              className="entwurf-input"
              value={customerAddress}
              onChange={setCustomerAddress}
              placeholder="Strasse, PLZ Ort"
            />
          </label>
        </section>

        <section className="entwurf-section">
          <div className="entwurf-section-title">Materialien</div>
          {materials.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Noch keine Materialien hinzugefügt.</div>
          )}
          {materials.map((m, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 36px', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="entwurf-input"
                value={m.name}
                onChange={e => updateMaterial(idx, { name: e.target.value })}
                placeholder="Material"
              />
              <input
                type="text"
                className="entwurf-input"
                value={m.quantity}
                onChange={e => updateMaterial(idx, { quantity: e.target.value })}
                placeholder="Menge"
              />
              <button
                type="button"
                className="entwurf-icon-btn"
                onClick={() => removeMaterial(idx)}
                aria-label="Material entfernen"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="entwurf-add-btn" onClick={addMaterial}>
            + Material hinzufügen
          </button>
        </section>

        <section className="entwurf-section">
          <div className="entwurf-section-title">Sonstige Notizen</div>
          <textarea
            className="entwurf-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Anfahrt, Zugang, Termine, Sonderwünsche …"
          />
        </section>

        <button
          type="submit"
          className="entwurf-submit-btn"
          disabled={submitting}
        >
          {submitting ? 'Wird gesendet…' : 'Entwurf an Büro senden'}
        </button>
      </form>
    </div>
  )
}
