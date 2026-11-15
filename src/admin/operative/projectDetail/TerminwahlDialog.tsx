import { useState } from 'react'
import {
  type Dauer, type FensterEingabe, type TerminwahlAnsicht, sendeTerminwahl,
} from '../../../api/serviceBegleitung'
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS, type AppointmentKind } from '../../../api/admin'
import { backdropCloseProps } from '../../../shared/backdropClose'
import { EmailRow } from '../EmailRow'
import { DauerAuswahl } from '../../components/DauerAuswahl'

// Dialog «Dem Kunden zur Wahl senden» — Servicebegleitung, Terminwahl per Link
// (docs/specs/servicebegleitung.md §7.1). Zwei bis drei Fenster (Tag, Zeit,
// Monteur), Termin-Art und Dauer, Empfänger, CC, freiwillige Mitteilung, «reserviert
// bis». Die Dauer kommt aus der Vorgabe der Art (Einstellungen → Termindauer) und ist je
// Anfrage änderbar; leer = der Kunde liest keine Dauer. Die Fenster
// sind danach beim Monteur reserviert, bis der Kunde wählt oder die Frist abläuft.
// Ob ein Fenster frei ist, prüft der Server (Termine, Reservationen, Absenzen) —
// eine Kollision kommt als 409 mit Klartext zurück und bleibt unter der Maske stehen.

const MAX_MESSAGE = 1000
const MAX_FENSTER = 3

interface Props {
  projectId: string
  staff: { id: string; name: string }[]
  vorgabe: { empfaenger: string; reserviertBis: string; kind: AppointmentKind; dauer: Record<string, Dauer> }
  onClose: () => void
  onSent: (ansicht: TerminwahlAnsicht) => void
  /** Fenster aus «Termin vorschlagen» (Phase 3) — dann geht die Wahl des Kunden ins Protokoll. */
  initialFenster?: FensterEingabe[]
}

const LEER: FensterEingabe = { datum: '', start: '08:00', ende: '10:00', monteur_ids: [] }

export function TerminwahlDialog({ projectId, staff, vorgabe, onClose, onSent, initialFenster }: Props) {
  const [fenster, setFenster] = useState<FensterEingabe[]>(
    initialFenster?.length ? initialFenster.slice(0, MAX_FENSTER) : [{ ...LEER }, { ...LEER }])
  const [email, setEmail] = useState(vorgabe.empfaenger)
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [reserviertBis, setReserviertBis] = useState(vorgabe.reserviertBis)
  const [kind, setKind] = useState<AppointmentKind>(vorgabe.kind)
  const [dauerVon, setDauerVon] = useState<number | null>(vorgabe.dauer[vorgabe.kind]?.von ?? null)
  const [dauerBis, setDauerBis] = useState<number | null>(vorgabe.dauer[vorgabe.kind]?.bis ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const vollstaendig = fenster.filter(f => f.datum && f.start && f.ende && f.monteur_ids.length > 0)
  const dauerOk = dauerVon == null || dauerBis == null || dauerVon <= dauerBis
  const bereit = vollstaendig.length > 0 && vollstaendig.length === fenster.length && !!email.trim() && dauerOk

  function waehleArt(neu: AppointmentKind) {
    setKind(neu)
    // Die Vorgabe der neuen Art übernehmen; ohne Vorgabe bleibt, was eingestellt ist.
    const v = vorgabe.dauer[neu]
    if (v) { setDauerVon(v.von); setDauerBis(v.bis) }
  }

  function setzeFenster(i: number, teil: Partial<FensterEingabe>) {
    setFenster(prev => prev.map((f, j) => (j === i ? { ...f, ...teil } : f)))
    setError('')
  }

  async function senden() {
    if (!bereit || sending) return
    setSending(true)
    setError('')
    try {
      const ansicht = await sendeTerminwahl(projectId, {
        fenster, empfaenger: email.trim(), cc: ccEmails.map(c => c.trim()).filter(Boolean),
        mitteilung: message.trim(), reserviert_bis: reserviertBis,
        kind, dauer_von: dauerVon ?? dauerBis, dauer_bis: dauerBis ?? dauerVon,
        aus_vorschlag: !!initialFenster?.length,
      })
      onSent(ansicht)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      setSending(false)
    }
  }

  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(() => { if (!sending) onClose() })}>
      <div className="admin-confirm-box" role="dialog" aria-label="Dem Kunden zur Wahl senden"
           style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">Dem Kunden zur Wahl senden</div>
        <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
          Der Kunde bekommt eine Mail mit «Termin wählen» und wählt eines der Fenster auf einer Seite
          ohne Login. Die Fenster sind bis zur Frist beim Monteur reserviert; die Wahl legt den Termin an.
        </div>

        {fenster.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginBottom: 8 }}>
            <label style={{ flex: '1 1 130px' }}>
              <span className="admin-form-label">Fenster {i + 1}</span>
              <input className="admin-form-input" type="date" value={f.datum} disabled={sending}
                     aria-label={`Fenster ${i + 1} Datum`} onChange={e => setzeFenster(i, { datum: e.target.value })} />
            </label>
            <input className="admin-form-input" type="time" step={900} value={f.start} disabled={sending}
                   aria-label={`Fenster ${i + 1} von`} style={{ width: 96 }}
                   onChange={e => setzeFenster(i, { start: e.target.value })} />
            <input className="admin-form-input" type="time" step={900} value={f.ende} disabled={sending}
                   aria-label={`Fenster ${i + 1} bis`} style={{ width: 96 }}
                   onChange={e => setzeFenster(i, { ende: e.target.value })} />
            <select className="admin-form-input" value={f.monteur_ids[0] ?? ''} disabled={sending}
                    aria-label={`Fenster ${i + 1} Monteur`} style={{ flex: '1 1 140px' }}
                    onChange={e => setzeFenster(i, { monteur_ids: e.target.value ? [e.target.value] : [] })}>
              <option value="">Monteur wählen</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {fenster.length > 1 && (
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={sending}
                      aria-label={`Fenster ${i + 1} entfernen`}
                      onClick={() => setFenster(prev => prev.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
        ))}
        {fenster.length < MAX_FENSTER && (
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={sending}
                  onClick={() => setFenster(prev => [...prev, { ...LEER }])} style={{ marginBottom: 12 }}>
            + Fenster
          </button>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <label style={{ flex: '1 1 140px' }}>
            <span className="admin-form-label">Termin-Art</span>
            <select className="admin-form-input" value={kind} disabled={sending}
                    onChange={e => waehleArt(e.target.value as AppointmentKind)}>
              {APPOINTMENT_KINDS.map(k => <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <DauerAuswahl label="Dauer von" wert={dauerVon} disabled={sending} onChange={setDauerVon} />
          <DauerAuswahl label="bis" wert={dauerBis} disabled={sending} onChange={setDauerBis} />
        </div>
        {!dauerOk && <div className="admin-form-error" style={{ marginTop: -6, marginBottom: 12 }}>
          «Dauer von» ist länger als «bis».</div>}

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label" htmlFor="terminwahl-email">Empfänger E-Mail</label>
          <input id="terminwahl-email" className="admin-form-input" type="email" value={email} disabled={sending}
                 onChange={e => setEmail(e.target.value)} placeholder="kunde@example.com" />
          {ccEmails.map((v, i) => (
            <EmailRow key={`cc-${i}`} value={v} label={`CC ${i + 1}`} prefix="CC" disabled={sending}
                      onChange={next => setCcEmails(prev => prev.map((x, j) => (j === i ? next : x)))}
                      onRemove={() => setCcEmails(prev => prev.filter((_, j) => j !== i))} />
          ))}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={sending}
                    onClick={() => setCcEmails(prev => [...prev, ''])}>+ CC</button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label" htmlFor="terminwahl-frist">Reserviert bis</label>
          <input id="terminwahl-frist" className="admin-form-input" type="datetime-local" value={reserviertBis}
                 disabled={sending} onChange={e => setReserviertBis(e.target.value)} style={{ maxWidth: 240 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label" htmlFor="terminwahl-message">
            Mitteilung an den Kunden <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(freiwillig)</span>
          </label>
          <textarea id="terminwahl-message" className="admin-form-input" rows={3} maxLength={MAX_MESSAGE}
                    value={message} disabled={sending} onChange={e => setMessage(e.target.value)}
                    placeholder="z.B. Bitte den Zugang zum Heizungsraum freihalten." style={{ resize: 'vertical' }} />
        </div>

        {error && <div className="admin-form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="admin-confirm-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={sending}>
            Abbrechen
          </button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => void senden()}
                  disabled={!bereit || sending}>
            {sending ? 'Wird gesendet…' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  )
}
