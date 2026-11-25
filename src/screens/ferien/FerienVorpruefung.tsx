// Vorprüfung im Ferienantrag (docs/specs/ferienplanung.md §7.2, E6): Ampel vor dem
// Absenden, gesperrte Zeiten des Jahres und der Hinweis «zwei Wochen am Stück».
// Nur wenn die Ferienplanung beim Betrieb wirkt (nicht im Betatest). Kollegen
// erscheinen nie mit Namen. Fehler (offline, Server) zeigen nichts und sperren nichts —
// der Server prüft beim Absenden ohnehin.
import { useEffect, useState } from 'react'
import { getMeinKalender, vorpruefen, type FerienKalender, type FerienVorpruefung as Pruefung } from '../../api/ferienplanungPwa'
import './ferienVorpruefung.css'

const GEPRUEFT = ['vacation', 'other']

function datum(iso: string): string {
  const [, m, t] = iso.split('-')
  return `${t}.${m}.`
}

export function FerienVorpruefung({ absenceType, dateStart, dateEnd, halfDay, onSperre }: {
  absenceType: string
  dateStart: string
  dateEnd: string
  halfDay?: string | null
  /** true = harter Befund, Absenden sperren. */
  onSperre: (gesperrt: boolean) => void
}) {
  const jahr = Number((dateStart || '').slice(0, 4)) || new Date().getFullYear()
  const [kalender, setKalender] = useState<FerienKalender | null>(null)
  const [pruefung, setPruefung] = useState<Pruefung | null>(null)

  useEffect(() => {
    let weg = false
    getMeinKalender(jahr).then(k => { if (!weg) setKalender(k) }).catch(() => { if (!weg) setKalender(null) })
    return () => { weg = true }
  }, [jahr])

  const aktiv = !!kalender?.wirkt && GEPRUEFT.includes(absenceType) && !!dateStart && !!dateEnd && dateEnd >= dateStart
  useEffect(() => {
    if (!aktiv) { setPruefung(null); onSperre(false); return }
    let weg = false
    const t = setTimeout(() => {
      vorpruefen({ absence_type: absenceType, date_start: dateStart, date_end: dateEnd, half_day: halfDay ?? null })
        .then(p => { if (!weg) { setPruefung(p); onSperre(!!p.meldung) } })
        .catch(() => { if (!weg) { setPruefung(null); onSperre(false) } })
    }, 300)
    return () => { weg = true; clearTimeout(t) }
  }, [aktiv, absenceType, dateStart, dateEnd, halfDay, onSperre])

  if (!kalender?.wirkt) return null
  const weiche = (pruefung?.befunde ?? []).filter(b => b.haerte !== 'hart' || b.nur_beantragt)
  return (
    <div className="ferien-vp">
      {pruefung?.meldung && <div className="ferien-vp-ampel rot" role="alert">⛔ {pruefung.meldung}</div>}
      {!pruefung?.meldung && weiche.length > 0 && (
        <div className="ferien-vp-ampel gelb">
          ⚠ Hinweis: {weiche.map(b => b.titel).join(', ')} — der Antrag geht trotzdem an die Freigabe.
        </div>
      )}
      {pruefung && !pruefung.meldung && weiche.length === 0 && (
        <div className="ferien-vp-ampel gruen">✓ Passt — keine Sperrfrist, keine Regel verletzt.</div>
      )}
      {kalender.sperrfristen.length > 0 && (
        <div className="ferien-vp-sperren">
          Gesperrte Zeiten {jahr}:{' '}
          {kalender.sperrfristen.map(s => `${s.titel} ${datum(s.von)}–${datum(s.bis)}`).join(' · ')}
        </div>
      )}
      {kalender.zwei_wochen === 'fehlt' && (
        <div className="ferien-vp-sperren">Du hast dieses Jahr noch keine zwei Wochen Ferien am Stück geplant.</div>
      )}
    </div>
  )
}
