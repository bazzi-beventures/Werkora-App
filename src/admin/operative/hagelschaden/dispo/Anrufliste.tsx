// Hagelschaden-Disposition — Anrufliste: vorgemerkte Einsätze mit dem Kunden
// abstimmen. Spec: docs/specs/hagelschaden-disposition.md §10.3, Schritt 2.
//
// Am Handy die Hauptansicht: wer morgens zwanzig Kunden anruft, tut das mit dem
// Telefon in der Hand. «Angefragt» und «bestätigt» halten den Stopp bei einer
// Neuberechnung fest; «passt nicht» fragt, ab wann der Kunde kann.

import { useCallback, useEffect, useState } from 'react'
import {
  getVormerkungen, patchVormerkung,
  type Vormerkung, type VormerkungPatch,
} from '../../../../api/admin/hagelschadenDispo'
import { EINSATZART_LABELS } from '../dispoAnzeige'
import { STATUS_LABELS, tagKurz, telLink, zeitKurz } from './dispoFormat'

export function Anrufliste({ kampagne, onFehler, onGeaendert }: {
  kampagne?: string
  onFehler: (text: string) => void
  onGeaendert?: () => void
}) {
  const [liste, setListe] = useState<Vormerkung[] | null>(null)
  const [ablehnen, setAblehnen] = useState<number | null>(null)
  const [abDatum, setAbDatum] = useState('')

  const laden = useCallback(async () => {
    try {
      const r = await getVormerkungen({ status: ['vorgeschlagen', 'angefragt'] }, kampagne)
      setListe(r.vormerkungen)
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Liste konnte nicht geladen werden.')
      setListe([])
    }
  }, [kampagne, onFehler])

  useEffect(() => { void laden() }, [laden])

  async function setze(v: Vormerkung, felder: VormerkungPatch) {
    try {
      const neu = await patchVormerkung(v.id, felder, kampagne)
      setListe(l => (l ?? []).flatMap(x => {
        if (x.id !== v.id) return [x]
        // bestätigt und abgelehnt verlassen die Anrufliste
        return neu.status === 'bestaetigt' || neu.status === 'abgelehnt' ? [] : [{ ...x, ...neu }]
      }))
      setAblehnen(null)
      onGeaendert?.()
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    }
  }

  if (liste === null) return <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
  if (liste.length === 0) {
    return <div className="admin-table-empty">Niemand anzurufen — keine offenen Vormerkungen.</div>
  }

  return (
    <ul className="dispo-anrufliste" aria-label="Anrufliste">
      {liste.map(v => (
        <li key={v.id} className="dispo-anruf">
          <div className="dispo-anruf-kopf">
            <strong>{tagKurz(v.datum)} {zeitKurz(v.start_time)}</strong>
            <span className="hagel-sub">{v.equipe?.name} · {EINSATZART_LABELS[v.einsatzart]}</span>
            <span className={`dispo-status dispo-status-${v.status}`}>{STATUS_LABELS[v.status]}</span>
          </div>
          <div>{v.projekt_nr} {v.projekt_name}</div>
          <div className="hagel-sub">{v.kunde}{v.kontakt_vor_ort ? ` · vor Ort: ${v.kontakt_vor_ort}` : ''}</div>
          <div className="hagel-sub">{v.adresse}</div>
          <div className="dispo-telefone">
            {v.telefon.length === 0 && <span className="hagel-sub">keine Telefonnummer im Kundenstamm</span>}
            {v.telefon.map(t => <a key={t} href={telLink(t)} className="dispo-tel">{t}</a>)}
          </div>
          {ablehnen === v.id ? (
            <div className="dispo-ablehnen">
              <label>
                <span>Kunde kann ab</span>
                <input type="date" className="admin-form-input" aria-label="Kunde kann ab"
                  value={abDatum} onChange={e => setAbDatum(e.target.value)} />
              </label>
              <button type="button" className="admin-btn admin-btn-primary"
                onClick={() => void setze(v, { status: 'abgelehnt', nicht_vor: abDatum || null })}>
                Speichern
              </button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setAblehnen(null)}>
                Abbrechen
              </button>
            </div>
          ) : (
            <div className="dispo-anruf-knoepfe">
              {v.status === 'vorgeschlagen' && (
                <button type="button" className="admin-btn admin-btn-secondary"
                  onClick={() => void setze(v, { status: 'angefragt' })}>
                  angefragt
                </button>
              )}
              <button type="button" className="admin-btn admin-btn-primary"
                onClick={() => void setze(v, { status: 'bestaetigt' })}>
                bestätigt
              </button>
              <button type="button" className="admin-btn admin-btn-secondary"
                onClick={() => { setAblehnen(v.id); setAbDatum('') }}>
                passt nicht
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
