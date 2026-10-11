// Hagelschaden-Disposition — ein Vorschlag in der Einsatzplanung (Phase 2b).
// Spec: docs/specs/hagelschaden-disposition.md §10.3.
//
// Öffnet sich beim Klick auf eine gestrichelte Kachel. Status setzen, freigeben
// (erst dann entsteht ein Termin) oder verwerfen — dieselben Endpunkte wie die
// Anrufliste, nur aus der Ansicht, die der Disponent jeden Tag benutzt.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  freigebenVormerkungen, patchVormerkung, verwerfeVormerkung,
  type Vormerkung, type VormerkungPatch,
} from '../../../../api/admin/hagelschadenDispo'
import { EINSATZART_LABELS } from '../dispoAnzeige'
import { STATUS_LABELS, tagKurz, telLink, zeitKurz } from './dispoFormat'

export function VorschlagPanel({ v, onClose, onGeaendert, onFehler, onErfolg, onProjekt }: {
  v: Vormerkung
  onClose: () => void
  onGeaendert: () => void
  onFehler: (text: string) => void
  onErfolg: (text: string) => void
  onProjekt?: (projectId: string) => void
}) {
  const [laeuft, setLaeuft] = useState(false)
  const [konflikt, setKonflikt] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function setze(felder: VormerkungPatch) {
    setLaeuft(true)
    try {
      await patchVormerkung(v.id, felder)
      onGeaendert()
      onClose()
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function freigeben(trotzAbsenz = false) {
    setLaeuft(true)
    try {
      const r = await freigebenVormerkungen([v.id], trotzAbsenz)
      const e = r.ergebnisse[0]
      if (e?.ok) {
        onErfolg('Termin angelegt.')
        onGeaendert()
        onClose()
      } else if (e?.konflikt) {
        setKonflikt(e.konflikt)
      } else {
        onFehler(e?.fehler ?? 'Freigabe fehlgeschlagen.')
      }
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Freigabe fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function verwerfen() {
    setLaeuft(true)
    try {
      await verwerfeVormerkung(v.id)
      onGeaendert()
      onClose()
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Verwerfen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" role="dialog" aria-label="Vorschlag" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Vorschlag</div>
          <button className="admin-modal-close" aria-label="Schliessen" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="hagel-sub">Vorgemerkt, noch kein Termin — der Monteur sieht ihn erst nach der Freigabe.</p>
          <div><strong>{v.projekt_nr} {v.projekt_name}</strong></div>
          <div className="hagel-sub">{v.adresse}</div>
          <div>{tagKurz(v.datum)} {zeitKurz(v.start_time)}{v.end_time ? `–${zeitKurz(v.end_time)}` : ''} · {v.equipe?.name}</div>
          <div className="hagel-sub">{EINSATZART_LABELS[v.einsatzart]} · Status: {STATUS_LABELS[v.status]}</div>
          {v.konflikt && <div className="hagel-hinweis">Ein Monteur dieser Equipe hat an dem Tag inzwischen einen anderen Termin.</div>}
          <div className="hagel-sub">{v.kunde}</div>
          <div className="dispo-telefone">
            {v.telefon.map(t => <a key={t} href={telLink(t)} className="dispo-tel">{t}</a>)}
          </div>
          {konflikt && (
            <div className="hagel-hinweis" role="alert">
              {konflikt}
              <div><button type="button" className="admin-btn admin-btn-secondary" disabled={laeuft}
                onClick={() => void freigeben(true)}>Trotzdem freigeben</button></div>
            </div>
          )}
        </div>
        <div className="admin-modal-footer dispo-aktionen">
          {v.status === 'vorgeschlagen' && (
            <button className="admin-btn admin-btn-secondary" disabled={laeuft} onClick={() => void setze({ status: 'angefragt' })}>
              angefragt
            </button>
          )}
          {v.status !== 'bestaetigt' && (
            <button className="admin-btn admin-btn-secondary" disabled={laeuft} onClick={() => void setze({ status: 'bestaetigt' })}>
              bestätigt
            </button>
          )}
          <button className="admin-btn admin-btn-primary" disabled={laeuft} onClick={() => void freigeben()}>
            Freigeben
          </button>
          <button className="admin-btn admin-btn-secondary" disabled={laeuft} onClick={() => void verwerfen()}>
            Verwerfen
          </button>
          {onProjekt && (
            <button className="admin-btn admin-btn-secondary" onClick={() => onProjekt(v.project_id)}>Projekt öffnen</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
