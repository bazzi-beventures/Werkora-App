import { useEffect, useRef, useState } from 'react'
import {
  listKreditoren, type KreditorAnsicht, type KreditorSummary, type KreditorZaehler,
} from '../../api/kreditoren'
import { useToast, ToastHost } from '../components/useToast'
import { useIsMobile } from '../useIsMobile'
import KreditorDetail from './KreditorDetail'
import KreditorListe from './KreditorListe'
import KreditorUpload from './KreditorUpload'
import { ANSICHTEN, POLL_MS, filterMeine, liestNoch } from './kreditorenLogik'
import './kreditoren.css'

/**
 * «Lieferantenrechnungen» — docs/specs/lieferantenrechnung-bexio.md §8.1.
 *
 * Das Büro lädt Rechnungen hoch, Werkora liest Lieferant, Beträge und
 * QR-Zahlteil und schlägt Projekt und Konto vor; das Büro prüft und gibt zur
 * Visierung, der Projektleiter visiert (auch am Handy). Ab dem Visum zählen die
 * Kosten in der Nachkalkulation.
 */

interface Props {
  /** Stand der Zähler beim Öffnen — wählt den Start-Reiter. */
  startZaehler?: KreditorZaehler | null
  /** Jede geladene Liste bringt die Zähler mit: Zahl am Navigationspunkt nachführen. */
  onZaehler?: (z: KreditorZaehler) => void
}

const LEER: Record<KreditorAnsicht, string> = {
  zu_pruefen: 'Nichts zu prüfen.',
  zu_visieren: 'Keine Rechnung wartet auf ein Visum.',
  visiert: 'Noch keine visierte Rechnung.',
  alle: 'Keine Rechnung gefunden.',
}

const SUCH_VERZOEGERUNG_MS = 300

/** Projektleiter ohne Prüfarbeit landen direkt bei «Zu visieren». */
function startAnsicht(z: KreditorZaehler | null | undefined): KreditorAnsicht {
  return z && z.zu_pruefen === 0 && z.zu_visieren_meine > 0 ? 'zu_visieren' : 'zu_pruefen'
}

export default function KreditorenScreen({ startZaehler, onZaehler }: Props) {
  const isMobile = useIsMobile()
  const { toast, showToast } = useToast()
  const [ansicht, setAnsicht] = useState<KreditorAnsicht>(() => startAnsicht(startZaehler))
  const [bills, setBills] = useState<KreditorSummary[] | null>(null)
  const [zaehler, setZaehler] = useState<KreditorZaehler | null>(startZaehler ?? null)
  const [failed, setFailed] = useState(false)
  // null = noch nicht angefasst → automatisch «an», wenn es eigene zu visieren gibt.
  const [nurMeineWahl, setNurMeineWahl] = useState<boolean | null>(null)
  const [q, setQ] = useState('')
  const [suchQ, setSuchQ] = useState('')
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const anfrage = useRef(0)
  // Als Ref, damit ein neu gebauter Callback des Aufrufers keinen neuen Ladelauf auslöst.
  const onZaehlerRef = useRef(onZaehler)
  useEffect(() => { onZaehlerRef.current = onZaehler })

  // Die Suche erst nach einer kurzen Tipp-Pause abschicken.
  useEffect(() => {
    const t = setTimeout(() => setSuchQ(q), SUCH_VERZOEGERUNG_MS)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const nr = ++anfrage.current
    const filter = ansicht === 'alle' ? { q: suchQ, von, bis } : {}
    listKreditoren(ansicht, filter)
      .then(res => {
        if (nr !== anfrage.current) return
        setBills(res.bills ?? [])
        setZaehler(res.zaehler)
        setFailed(false)
        if (res.zaehler) onZaehlerRef.current?.(res.zaehler)
      })
      .catch(() => { if (nr === anfrage.current) setFailed(true) })
  }, [ansicht, suchQ, von, bis, reload])

  // Solange irgendeine sichtbare Rechnung gelesen wird, alle 4 s neu laden.
  const liest = !offen && bills !== null && liestNoch(bills)
  useEffect(() => {
    if (!liest) return
    const t = setInterval(() => setReload(r => r + 1), POLL_MS)
    return () => clearInterval(t)
  }, [liest])

  function wechsle(a: KreditorAnsicht) {
    if (a === ansicht) return
    setBills(null)
    setAnsicht(a)
  }

  const neuLaden = () => setReload(r => r + 1)

  const nurMeine = nurMeineWahl ?? (zaehler?.zu_visieren_meine ?? 0) > 0
  const sichtbar = bills === null ? null : ansicht === 'zu_visieren' ? filterMeine(bills, nurMeine) : bills

  const untertitel = zaehler
    ? `${zaehler.zu_pruefen} zu prüfen · ${zaehler.zu_visieren} zu visieren`
      + (zaehler.zu_visieren_meine > 0 ? ` (davon ${zaehler.zu_visieren_meine} meine)` : '')
    : 'Laden…'

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lieferantenrechnungen</div>
          <div className="admin-page-subtitle">{untertitel}</div>
        </div>
        {!offen && (
          <div className="kred-umschalter" role="group" aria-label="Ansicht">
            {ANSICHTEN.map(a => (
              <button
                key={a.key}
                type="button"
                className={`admin-btn ${ansicht === a.key ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                aria-pressed={ansicht === a.key}
                onClick={() => wechsle(a.key)}
                style={{ fontSize: 13 }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {offen ? (
        <KreditorDetail
          key={offen}
          billId={offen}
          isMobile={isMobile}
          showToast={showToast}
          onClose={() => { setOffen(null); neuLaden() }}
          onChanged={neuLaden}
          onOpen={setOffen}
        />
      ) : (
        <>
          {ansicht === 'zu_pruefen' && (
            <KreditorUpload
              onOpen={setOffen}
              onUploaded={ids => {
                neuLaden()
                if (ids.length === 1) setOffen(ids[0])
                else if (ids.length > 1) showToast(`${ids.length} Rechnungen hochgeladen — sie werden gelesen.`, 'success')
              }}
            />
          )}

          {ansicht === 'zu_visieren' && (
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={nurMeine} onChange={e => setNurMeineWahl(e.target.checked)} />
              Nur meine (ich bin Projektleiter)
            </label>
          )}

          {ansicht === 'alle' && (
            <div className="kred-filter">
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="kred-q">Suche</label>
                <input id="kred-q" type="search" className="admin-form-input" value={q}
                       placeholder="Lieferant, Nummer, Projekt" onChange={e => setQ(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="kred-von">Von</label>
                <input id="kred-von" type="date" className="admin-form-input" value={von}
                       onChange={e => setVon(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="kred-bis">Bis</label>
                <input id="kred-bis" type="date" className="admin-form-input" value={bis}
                       onChange={e => setBis(e.target.value)} />
              </div>
            </div>
          )}

          <div className="admin-table-wrap">
            {sichtbar === null && !failed && (
              <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
            )}
            {failed && (
              <div role="alert" className="admin-table-empty">
                Die Rechnungen konnten nicht geladen werden.{' '}
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={neuLaden}>
                  Erneut versuchen
                </button>
              </div>
            )}
            {sichtbar !== null && !failed && (
              <KreditorListe
                bills={sichtbar}
                isMobile={isMobile}
                empty={ansicht === 'zu_visieren' && nurMeine && bills && bills.length > 0
                  ? 'Keine eigene Rechnung zu visieren — «Nur meine» ausschalten zeigt alle.'
                  : LEER[ansicht]}
                onOpen={setOffen}
              />
            )}
          </div>
        </>
      )}
      <ToastHost toast={toast} />
    </div>
  )
}
