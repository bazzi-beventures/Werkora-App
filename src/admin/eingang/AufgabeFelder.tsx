import { useEffect, useId, useState } from 'react'
import { getEingangZustaendige, type AufgabePayload, type EingangZustaendig } from '../../api/admin/mailEingang'
import EingangProjektAuswahl from './EingangProjektAuswahl'
import { AUFGABE_MAX, ZUSTAENDIG_AUTO, belegText, type VorschlagEingabe } from './mailEingang'

/**
 * Felder einer Aufgabe aus dem Mail-Eingang — docs/specs/mail-eingang-aufgaben-antworten.md §4.3.
 *
 * Überschreibbar ist, was eine Karte im Aufgaben-Board auch hat: Titel,
 * Fälligkeit, Projekt, zuständige Person, Beschreibung. «Zuständig» steht
 * zuerst auf «Projektleiter des Projekts» — dieselbe Regel wie «Neue Aufgabe»
 * im Board; wechselt das Büro das Projekt, wechselt der Projektleiter mit,
 * solange es niemanden selbst gewählt hat. Aufgelöst wird beim Übernehmen.
 *
 * Darunter steht die Stelle aus der Mail, auf die sich der Vorschlag stützt.
 */

interface Props {
  payload: AufgabePayload
  eingabe: VorschlagEingabe
  disabled: boolean
  setFeld: (key: string, wert: string) => void
  setProjekt: (projekt: VorschlagEingabe['projekt']) => void
  /** Woher das gewählte Projekt kommt, wenn nicht von hier (VorschlagKarte). */
  projektHinweis?: string
}

export default function AufgabeFelder({ payload, eingabe, disabled, setFeld, setProjekt, projektHinweis }: Props) {
  const feldId = useId()
  const [personen, setPersonen] = useState<EingangZustaendig[] | null>(null)
  const [ladeFehler, setLadeFehler] = useState(false)

  useEffect(() => {
    let aktiv = true
    getEingangZustaendige()
      .then(p => { if (aktiv) setPersonen(p) })
      .catch(() => { if (aktiv) { setPersonen([]); setLadeFehler(true) } })
    return () => { aktiv = false }
  }, [])

  const wert = (key: string) => eingabe.felder[key] ?? ''
  const beleg = belegText(payload)
  const zustaendig = wert('assignee') || ''

  return (
    <div className="eingang-felder">
      <label className="admin-form-group eingang-feld-breit" htmlFor={`${feldId}-title`}>
        <span className="admin-form-label">Titel</span>
        <input id={`${feldId}-title`} className="admin-form-input" type="text" autoComplete="off"
               maxLength={AUFGABE_MAX.title} value={wert('title')} disabled={disabled}
               onChange={e => setFeld('title', e.target.value)} />
      </label>
      <label className="admin-form-group" htmlFor={`${feldId}-due`}>
        <span className="admin-form-label">Fällig am</span>
        <input id={`${feldId}-due`} className="admin-form-input" type="date" value={wert('due_date')}
               disabled={disabled} onChange={e => setFeld('due_date', e.target.value)} />
      </label>
      <label className="admin-form-group" htmlFor={`${feldId}-assignee`}>
        <span className="admin-form-label">Zuständig</span>
        <select id={`${feldId}-assignee`} className="admin-form-input" value={zustaendig}
                disabled={disabled} onChange={e => setFeld('assignee', e.target.value)}>
          <option value={ZUSTAENDIG_AUTO}>Projektleiter des Projekts</option>
          <option value="">Niemand</option>
          {/* Eine gewählte Person bleibt wählbar, auch wenn die Liste (noch) fehlt. */}
          {zustaendig && zustaendig !== ZUSTAENDIG_AUTO && !personen?.some(p => p.id === zustaendig) && (
            <option value={zustaendig}>Gewählte Person</option>
          )}
          {(personen ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {ladeFehler && <span className="eingang-hinweis">Die Mitarbeitenden liessen sich nicht laden.</span>}
      </label>
      <div className="eingang-feld-breit">
        <EingangProjektAuswahl
          candidates={payload.projects ?? []}
          selected={eingabe.projekt}
          disabled={disabled}
          onPick={setProjekt}
          hinweis={projektHinweis}
        />
        {eingabe.projekt && (
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={disabled} onClick={() => setProjekt(null)}>
            Ohne Projekt
          </button>
        )}
      </div>
      <label className="admin-form-group eingang-feld-breit" htmlFor={`${feldId}-description`}>
        <span className="admin-form-label">Beschreibung</span>
        <textarea id={`${feldId}-description`} className="admin-form-input" rows={3}
                  maxLength={AUFGABE_MAX.description} value={wert('description')} disabled={disabled}
                  onChange={e => setFeld('description', e.target.value)} />
      </label>
      {beleg && <div className="eingang-hinweis eingang-feld-breit">{beleg}</div>}
    </div>
  )
}
