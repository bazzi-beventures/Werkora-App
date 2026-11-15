import { useEffect, useState } from 'react'
import {
  TERMINWAHL_GEAENDERT, type TerminVorschlaegeAntwort, type TerminVorschlag, type TerminwahlAnsicht,
  type VorschlagEingabe, fetchTerminVorschlaege, fetchTerminwahl, protokolliereVorschlag,
} from '../../../api/serviceBegleitung'
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS, type AppointmentKind } from '../../../api/admin'
import { backdropCloseProps } from '../../../shared/backdropClose'
import { DauerAuswahl } from '../../components/DauerAuswahl'
import { TerminwahlDialog } from './TerminwahlDialog'

// Dialog «Termin vorschlagen» — Servicebegleitung Phase 3 (docs/specs/servicebegleitung.md §6.6).
//
// Oben die Eingaben (Art, Dauer, dringend, Wunsch), darunter zwei bis drei Vorschläge
// als Karten mit Begründung, die Ausgeschlossenen eingeklappt. Der Dialog legt selbst
// nichts an (L1): «Übernehmen» gibt den Vorschlag an die Termin-Kachel, die ihn über
// denselben Weg speichert wie einen von Hand angelegten Termin (mit Absenzprüfung).
// «Dem Kunden zur Wahl senden» übergibt die angehakten Vorschläge an die Terminwahl.

const MAX_HORIZONT = 40
const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

interface Props {
  projectId: string
  staff: { id: string; name: string }[]
  kindVorschlag: AppointmentKind
  /** Werkzeug «terminwahl» an: Vorschläge lassen sich dem Kunden zur Wahl schicken. */
  terminwahl: boolean
  onUebernehmen: (v: TerminVorschlag, kind: AppointmentKind) => void
  onClose: () => void
}

/** «Do 19.11.» */
export function tagKurz(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const datum = new Date(y, m - 1, d)
  return `${WOCHENTAGE[datum.getDay()]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`
}

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function TerminVorschlagDialog({ projectId, staff, kindVorschlag, terminwahl, onUebernehmen, onClose }: Props) {
  const [kind, setKind] = useState<AppointmentKind>(kindVorschlag)
  const [dauer, setDauer] = useState<number | null>(null)
  const [dringend, setDringend] = useState(false)
  const [haelfte, setHaelfte] = useState<'' | 'vormittag' | 'nachmittag'>('')
  const [wunschStaff, setWunschStaff] = useState('')
  const [ab, setAb] = useState('')
  const [antwort, setAntwort] = useState<TerminVorschlaegeAntwort | null>(null)
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState('')
  const [angehakt, setAngehakt] = useState<number[]>([])
  const [wahl, setWahl] = useState<TerminwahlAnsicht | null>(null)

  async function berechnen(horizont: number | null = null, eingabeKind: AppointmentKind = kind) {
    setLaden(true)
    setFehler('')
    const eingabe: VorschlagEingabe = {
      kind: eingabeKind, dauer_min: dauer, dringend, tageshaelfte: haelfte || null,
      staff_id: wunschStaff || null, ab: ab || null, horizont,
    }
    try {
      const a = await fetchTerminVorschlaege(projectId, eingabe)
      setAntwort(a)
      setAngehakt(a.vorschlaege.map((_, i) => i))
      // Ohne eigene Angabe rechnet der Server mit der Vorgabe der Art — das zeigen wir an.
      if (dauer == null) setDauer(a.dauer_min)
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setLaden(false)
    }
  }

  // Beim Öffnen gleich rechnen: der Normalfall braucht keine Eingabe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void berechnen() }, [])

  function uebernehmen(i: number) {
    if (!antwort) return
    void protokolliereVorschlag(projectId, `rang_${i + 1}` as 'rang_1' | 'rang_2' | 'rang_3')
    onUebernehmen(antwort.vorschlaege[i], kind)
  }

  function selbstPlanen() {
    if (antwort?.vorschlaege.length) void protokolliereVorschlag(projectId, 'von_hand')
    onClose()
  }

  async function zurWahl() {
    setFehler('')
    try {
      const a = await fetchTerminwahl(projectId)
      if (a.anfragen.some(x => x.status === 'offen')) {
        setFehler('Für diesen Auftrag ist schon eine Terminanfrage offen. Zuerst zurückziehen.')
        return
      }
      setWahl(a)
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }

  if (wahl && antwort) {
    return (
      <TerminwahlDialog
        projectId={projectId}
        staff={staff}
        vorgabe={{ empfaenger: wahl.empfaenger_vorschlag, reserviertBis: wahl.vorgabe_reserviert_bis, kind,
                   dauer: { ...wahl.dauer_vorgaben, ...(dauer ? { [kind]: { von: dauer, bis: dauer } } : {}) } }}
        initialFenster={angehakt.map(i => antwort.vorschlaege[i]).map(v => ({
          datum: v.datum, start: v.start, ende: v.ende, monteur_ids: [v.staff_id] }))}
        onClose={() => setWahl(null)}
        onSent={() => { window.dispatchEvent(new Event(TERMINWAHL_GEAENDERT)); onClose() }}
      />
    )
  }

  const kannHorizont = antwort && !antwort.vorschlaege.length && antwort.horizont < MAX_HORIZONT

  return (
    <div className="admin-confirm-overlay" {...backdropCloseProps(() => { if (!laden) onClose() })}>
      <div className="admin-confirm-box" role="dialog" aria-label="Termin vorschlagen"
           style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">Termin vorschlagen</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginBottom: 8 }}>
          <label style={{ flex: '1 1 140px' }}>
            <span className="admin-form-label">Termin-Art</span>
            <select className="admin-form-input" value={kind} disabled={laden}
                    onChange={e => { setKind(e.target.value as AppointmentKind); setDauer(null) }}>
              {APPOINTMENT_KINDS.map(k => <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <DauerAuswahl label="Dauer" wert={dauer} disabled={laden} onChange={setDauer} />
          <label style={{ flex: '0 1 130px' }}>
            <span className="admin-form-label">Tageshälfte</span>
            <select className="admin-form-input" value={haelfte} disabled={laden}
                    onChange={e => setHaelfte(e.target.value as typeof haelfte)}>
              <option value="">egal</option>
              <option value="vormittag">Vormittag</option>
              <option value="nachmittag">Nachmittag</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <label style={{ flex: '1 1 150px' }}>
            <span className="admin-form-label">Monteur (Wunsch)</span>
            <select className="admin-form-input" value={wunschStaff} disabled={laden}
                    onChange={e => setWunschStaff(e.target.value)}>
              <option value="">alle passenden</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ flex: '0 1 150px' }}>
            <span className="admin-form-label">Frühestens ab</span>
            <input className="admin-form-input" type="date" value={ab} disabled={laden}
                   onChange={e => setAb(e.target.value)} />
          </label>
          <label style={{ paddingBottom: 10 }}>
            <input type="checkbox" checked={dringend} disabled={laden} onChange={e => setDringend(e.target.checked)} />
            {' '}dringend
          </label>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={laden}
                  onClick={() => void berechnen()} style={{ marginBottom: 6 }}>
            {laden ? 'Rechnet…' : 'Neu berechnen'}
          </button>
        </div>

        {antwort?.hinweise.map(h => (
          <div key={h} className="admin-form-hint-warn" style={{ marginBottom: 6 }}>{h}</div>
        ))}

        {antwort && antwort.vorschlaege.length === 0 && (
          <div role="status" style={{ fontSize: 14, marginBottom: 12 }}>
            {antwort.grund}
            {kannHorizont && (
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={laden}
                      style={{ marginLeft: 8 }}
                      onClick={() => void berechnen(Math.min(MAX_HORIZONT, antwort.horizont * 2))}>
                Horizont verdoppeln
              </button>
            )}
          </div>
        )}

        {antwort?.vorschlaege.map((v, i) => (
          <div key={`${v.staff_id}-${v.datum}-${v.start}`} className="admin-table-wrap"
               style={{ padding: 12, marginBottom: 8 }} data-testid="terminvorschlag">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {terminwahl && (
                <input type="checkbox" aria-label={`Vorschlag ${i + 1} zur Wahl`} checked={angehakt.includes(i)}
                       onChange={e => setAngehakt(prev => e.target.checked ? [...prev, i].sort((a, b) => a - b) : prev.filter(x => x !== i))} />
              )}
              <strong style={{ flex: 1 }}>{tagKurz(v.datum)} · {v.start}–{v.ende} · {v.name}</strong>
              <span className="admin-badge admin-badge-approved" title="Punkte 0–100">{v.score}</span>
              <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => uebernehmen(i)}>
                Übernehmen
              </button>
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
              {v.gruende.map(g => <li key={g}>{g}</li>)}
            </ul>
          </div>
        ))}

        {antwort && antwort.ausgeschlossen.length > 0 && (
          <details style={{ fontSize: 13, marginBottom: 12 }}>
            <summary>Nicht vorgeschlagen ({antwort.ausgeschlossen.length})</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {antwort.ausgeschlossen.map(a => <li key={a.staff_id}>{a.name}: {a.grund}</li>)}
            </ul>
          </details>
        )}

        {fehler && <div className="admin-form-error" role="alert" style={{ marginBottom: 12 }}>{fehler}</div>}

        <div className="admin-confirm-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={selbstPlanen} disabled={laden}>
            Selbst planen
          </button>
          {terminwahl && (
            <button type="button" className="admin-btn admin-btn-secondary" disabled={laden || angehakt.length === 0}
                    onClick={() => void zurWahl()}>
              Dem Kunden zur Wahl senden ({angehakt.length})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
