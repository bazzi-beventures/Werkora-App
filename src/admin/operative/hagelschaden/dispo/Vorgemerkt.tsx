// Hagelschaden-Disposition — vorgemerkte Einsätze freigeben.
// Spec: docs/specs/hagelschaden-disposition.md §10.3, Schritt 3.
//
// Erst hier entstehen Termine — je Vormerkung einer, über denselben Pfad wie der
// Termin-Dialog der Einsatzplanung. Eine Absenz hält nur ihren Stopp auf; die
// Rückfrage «trotzdem freigeben?» gilt genau für diese.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  freigebenVormerkungen, getVormerkungen, verwerfeVormerkung,
  type FreigabeErgebnis, type Vormerkung,
} from '../../../../api/admin/hagelschadenDispo'
import { EINSATZART_LABELS } from '../dispoAnzeige'
import { STATUS_LABELS, tagKurz, zeitKurz } from './dispoFormat'

export function Vorgemerkt({ kampagne, nurBestaetigte, onFehler, onErfolg, onGeaendert }: {
  kampagne?: string
  nurBestaetigte: boolean
  onFehler: (text: string) => void
  onErfolg: (text: string) => void
  onGeaendert?: () => void
}) {
  const [liste, setListe] = useState<Vormerkung[] | null>(null)
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set())
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<FreigabeErgebnis | null>(null)

  const laden = useCallback(async () => {
    try {
      const r = await getVormerkungen({ status: ['vorgeschlagen', 'angefragt', 'bestaetigt'] }, kampagne)
      setListe(r.vormerkungen)
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Liste konnte nicht geladen werden.')
      setListe([])
    }
  }, [kampagne, onFehler])

  useEffect(() => { void laden() }, [laden])

  const freigebbar = (v: Vormerkung) => !nurBestaetigte || v.status === 'bestaetigt'
  const tage = useMemo(() => {
    const m = new Map<string, Vormerkung[]>()
    for (const v of liste ?? []) m.set(v.datum, [...(m.get(v.datum) ?? []), v])
    return [...m.entries()]
  }, [liste])

  function umschalten(id: number) {
    setAuswahl(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function freigeben(ids: number[], trotzAbsenz = false) {
    if (ids.length === 0) return
    setLaeuft(true)
    try {
      const r = await freigebenVormerkungen(ids, trotzAbsenz, kampagne)
      setErgebnis(r)
      if (r.freigegeben > 0) onErfolg(`${r.freigegeben} ${r.freigegeben === 1 ? 'Termin' : 'Termine'} angelegt.`)
      setAuswahl(new Set())
      await laden()
      onGeaendert?.()
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function verwerfen(v: Vormerkung) {
    try {
      await verwerfeVormerkung(v.id, kampagne)
      setListe(l => (l ?? []).filter(x => x.id !== v.id))
      onGeaendert?.()
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Verwerfen fehlgeschlagen.')
    }
  }

  if (liste === null) return <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>

  const konflikte = (ergebnis?.ergebnisse ?? []).filter(e => e.konflikt)
  const fehler = (ergebnis?.ergebnisse ?? []).filter(e => !e.ok && !e.konflikt)
  const bestaetigte = (liste ?? []).filter(v => v.status === 'bestaetigt').map(v => v.id)

  return (
    <div className="dispo-vorgemerkt">
      <div className="dispo-aktionen">
        <button type="button" className="admin-btn admin-btn-primary" disabled={laeuft || auswahl.size === 0}
          onClick={() => void freigeben([...auswahl])}>
          Ausgewählte freigeben ({auswahl.size})
        </button>
        <button type="button" className="admin-btn admin-btn-secondary" disabled={laeuft || bestaetigte.length === 0}
          onClick={() => void freigeben(bestaetigte)}>
          Alle bestätigten freigeben ({bestaetigte.length})
        </button>
        <span className="hagel-sub">
          {nurBestaetigte ? 'Freigegeben wird nur, was der Kunde bestätigt hat (Parameter).' :
            'Freigabe auch ohne Bestätigung des Kunden (Parameter).'}
        </span>
      </div>

      {konflikte.length > 0 && (
        <div className="hagel-hinweis" role="alert">
          {konflikte.map(k => <div key={k.id}>{k.konflikt}</div>)}
          <button type="button" className="admin-btn admin-btn-secondary" disabled={laeuft}
            onClick={() => void freigeben(konflikte.map(k => k.id), true)}>
            Trotzdem freigeben ({konflikte.length})
          </button>
        </div>
      )}
      {fehler.length > 0 && (
        <div className="hagel-hinweis">{fehler.map(f => <div key={f.id}>Vormerkung {f.id}: {f.fehler}</div>)}</div>
      )}

      {tage.length === 0 && <div className="admin-table-empty">Keine Vormerkungen. Im Reiter «Plan» einen Plan berechnen und vormerken.</div>}
      {tage.map(([datum, vms]) => (
        <section key={datum} className="dispo-tag" aria-label={`Vorgemerkt ${tagKurz(datum)}`}>
          <h4>{tagKurz(datum)}</h4>
          <ul className="dispo-liste">
            {vms.map(v => (
              <li key={v.id} className="dispo-vm">
                <label className="hagel-check">
                  <input type="checkbox" checked={auswahl.has(v.id)} disabled={!freigebbar(v)}
                    aria-label={`${v.projekt_nr} ${v.projekt_name} auswählen`}
                    onChange={() => umschalten(v.id)} />
                  <span>{zeitKurz(v.start_time)} {v.projekt_nr} {v.projekt_name}</span>
                </label>
                <span className="hagel-sub">{v.equipe?.name} · {EINSATZART_LABELS[v.einsatzart]} · {v.adresse}</span>
                <span className={`dispo-status dispo-status-${v.status}`}>{STATUS_LABELS[v.status]}</span>
                <button type="button" className="dispo-link" onClick={() => void verwerfen(v)}>verwerfen</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
