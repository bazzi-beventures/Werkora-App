// Zählmodus: ein Artikel pro Bildschirm (docs/specs/rollierende-inventur.md §10.3).
//
// Warum nicht die Tabelle, die es schon gibt: Gezählt wird im Lager, mit dem
// Handy in der einen und dem Karton in der anderen Hand. Eine Tabelle mit
// zwanzig Zeilen à drei Spalten verlangt dort zweierlei, was man dann nicht
// hat — genaues Zielen und beide Daumen. Hier steht eine Frage auf dem
// Bildschirm, und die Antwort ist eine Zahl.
//
// Die Komponente liegt in `shared/`, weil beide Shells sie brauchen: der Admin
// als Umschalter neben der Liste, die Monteur-PWA als einzige Zählmaske (E8 —
// ein Lagerist ohne Admin-Rolle zählt und schliesst ab). Sie kennt deshalb
// keine Navigation, nur `onBack` und `onDone`.
//
// Gespeichert wird bei jedem «Weiter», nicht am Ende: Im Lager geht das Handy
// auch mal aus, und eine halbe Stunde Zählarbeit im Arbeitsspeicher ist eine
// halbe Stunde, die man ein zweites Mal macht.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isNetworkError } from '../../api/client'
import {
  closeStockCount, getStockCount, recordCountItem,
} from '../../api/inventory'
import type { CountSummary, StockCountDetail, StockCountItem } from '../../api/inventory'
import { AbschlussDialog } from './AbschlussDialog'
import './count.css'

/** Komma als Dezimaltrenner: Auf der Schweizer Handytastatur liegt es näher
 *  als der Punkt, und `parseFloat('2,5')` wäre sonst stillschweigend 2. */
export function parseMenge(roh: string): number | null {
  const t = roh.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function datumKurz(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function istUeberfaellig(dueOn: string | null | undefined): boolean {
  return Boolean(dueOn) && String(dueOn).slice(0, 10) < new Date().toISOString().slice(0, 10)
}

interface Props {
  countId: string
  /** Verlässt den Zählmodus, ohne abzuschliessen. */
  onBack: () => void
  /** Nach dem Abschluss — mit dem Ergebnis, damit die Hülle es zeigen kann. */
  onDone?: (summary: CountSummary) => void
  /** Nur im Admin gesetzt: Umschalter zurück auf die Tabelle. */
  onSwitchToList?: () => void
}

export default function CountWizard({ countId, onBack, onDone, onSwitchToList }: Props) {
  const [detail, setDetail] = useState<StockCountDetail | null>(null)
  const [idx, setIdx] = useState(0)
  const [entwurf, setEntwurf] = useState('')
  const [notiz, setNotiz] = useState('')
  const [notizOffen, setNotizOffen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const [fertig, setFertig] = useState(false)
  const [abschlussFrage, setAbschlussFrage] = useState(false)
  const [ergebnis, setErgebnis] = useState<CountSummary | null>(null)
  const [ladeFehler, setLadeFehler] = useState('')
  const feld = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let abgebrochen = false
    getStockCount(countId, { images: true })
      .then(d => {
        if (abgebrochen) return
        setDetail(d)
        // Einstieg an der ersten ungezählten Position: Wer die Zählung
        // fortsetzt, will nicht erst an zwölf erledigten vorbeitippen.
        const erste = d.items.findIndex(i => i.counted_qty == null)
        setIdx(erste >= 0 ? erste : 0)
        setFertig(erste < 0 && d.items.length > 0)
      })
      .catch((err: unknown) => {
        if (!abgebrochen) {
          setLadeFehler(err instanceof Error ? err.message : 'Zählung konnte nicht geladen werden')
        }
      })
    return () => { abgebrochen = true }
  }, [countId])

  const items = useMemo(() => detail?.items ?? [], [detail])
  const item: StockCountItem | undefined = items[idx]

  // Beim Positionswechsel steht der gespeicherte Wert im Feld — so sieht man
  // beim Zurückblättern, was man eingetragen hat, statt eines leeren Felds.
  const itemId = item?.id
  const itemMenge = item?.counted_qty ?? null
  const itemNotiz = item?.note ?? ''
  useEffect(() => {
    setEntwurf(itemMenge != null ? String(itemMenge) : '')
    setNotiz(itemNotiz)
    setNotizOffen(Boolean(itemNotiz))
    setFehler('')
  }, [itemId, itemMenge, itemNotiz])

  // `autoFocus` greift nur beim ersten Mal — das Feld bleibt beim Sprung zur
  // nächsten Position dasselbe Element. Ohne das hier tippt man ab Position
  // zwei ins Leere und muss jedes Mal erst hinfassen.
  useEffect(() => { feld.current?.focus() }, [itemId])

  const gezaehlt = items.filter(i => i.counted_qty != null).length
  const gesamt = items.length
  const offeneZahl = gesamt - gezaehlt

  const uebernommen = useMemo(() => {
    const roh = detail?.count?.scope?.carried_material_ids
    return new Set(Array.isArray(roh) ? roh.map(String) : [])
  }, [detail])

  const uebernehmenInsDetail = useCallback((neu: StockCountItem) => {
    setDetail(d => d && { ...d, items: d.items.map(i => i.id === neu.id ? { ...i, ...neu } : i) })
  }, [])

  const weiterSpringen = useCallback(() => {
    setIdx(i => {
      if (i + 1 >= gesamt) {
        setFertig(true)
        return i
      }
      return i + 1
    })
  }, [gesamt])

  async function speichernUndWeiter() {
    if (!item) return
    const wert = parseMenge(entwurf)
    if (wert === null) {
      setFehler('Bitte eine Menge von 0 oder mehr eintragen.')
      return
    }
    setBusy(true)
    try {
      const res = await recordCountItem(countId, item.id, wert, notiz.trim() || null)
      uebernehmenInsDetail(res.item)
      setFehler('')
      weiterSpringen()
    } catch (err: unknown) {
      // Stehenbleiben statt weiterspringen: Ein stiller Sprung liesse die
      // Position ungezählt zurück, und gemerkt hätte es niemand.
      setFehler(isNetworkError(err)
        ? 'Kein Netz — die Eingabe bleibt stehen, bitte nochmals versuchen.'
        : err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function ueberspringen() {
    if (!item) return
    // Eine Notiz ohne Menge ist der übliche Fall beim Überspringen («Regal
    // verstellt»). Ohne Notizänderung kostet das Überspringen keinen Request.
    if (notiz.trim() !== (item.note ?? '').trim()) {
      setBusy(true)
      try {
        const res = await recordCountItem(countId, item.id, item.counted_qty, notiz.trim() || null)
        uebernehmenInsDetail(res.item)
      } catch {
        // Die Notiz ist Beiwerk; das Überspringen selbst darf daran nicht
        // scheitern. Der Wert der Position bleibt unangetastet.
      } finally {
        setBusy(false)
      }
    }
    setFehler('')
    weiterSpringen()
  }

  function zurueck() {
    setFehler('')
    if (fertig) { setFertig(false); return }
    if (idx > 0) setIdx(idx - 1)
    else onBack()
  }

  function zuDenOffenen() {
    const erste = items.findIndex(i => i.counted_qty == null)
    if (erste < 0) return
    setFertig(false)
    setIdx(erste)
  }

  async function abschliessen() {
    setBusy(true)
    try {
      const res = await closeStockCount(countId)
      setAbschlussFrage(false)
      setErgebnis(res.summary)
      onDone?.(res.summary)
    } catch (err: unknown) {
      setFehler(err instanceof Error ? err.message : 'Abschluss fehlgeschlagen')
      setAbschlussFrage(false)
    } finally {
      setBusy(false)
    }
  }

  if (ladeFehler) {
    return (
      <div className="count-wizard">
        <div className="count-wizard-body">
          <div className="count-wizard-error">{ladeFehler}</div>
          <button className="admin-btn admin-btn-secondary" onClick={onBack}>Zurück</button>
        </div>
      </div>
    )
  }

  if (!detail) {
    return <div className="count-wizard"><div className="count-wizard-body">Laden…</div></div>
  }

  if (gesamt === 0) {
    return (
      <div className="count-wizard">
        <div className="count-wizard-body">
          <div>Diese Zählung hat keine Positionen.</div>
          <button className="admin-btn admin-btn-secondary" onClick={onBack}>Zurück</button>
        </div>
      </div>
    )
  }

  const kopf = (
    <div className="count-wizard-head">
      <div className="count-wizard-headline">
        <div style={{ minWidth: 0 }}>
          <div className="count-wizard-title">{detail.count.title}</div>
          <div className={`count-wizard-sub${istUeberfaellig(detail.count.due_on) ? ' is-overdue' : ''}`}>
            {gezaehlt} von {gesamt} gezählt
            {detail.count.due_on && ` · ${istUeberfaellig(detail.count.due_on) ? 'überfällig seit' : 'fällig'} ${datumKurz(detail.count.due_on)}`}
          </div>
        </div>
        {onSwitchToList && (
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onSwitchToList}>
            Als Liste
          </button>
        )}
      </div>
      <div className="count-wizard-bar">
        <span style={{ width: `${gesamt ? Math.round((gezaehlt / gesamt) * 100) : 0}%` }} />
      </div>
    </div>
  )

  if (ergebnis) {
    return (
      <div className="count-wizard">
        {kopf}
        <div className="count-wizard-body">
          <div className="count-wizard-summary">
            <div className="count-wizard-summary-big">Abgeschlossen</div>
            <p>
              {ergebnis.mit_differenz} von {ergebnis.gezaehlt} gezählten Positionen mit
              Abweichung, Differenz CHF {ergebnis.diff_value_ek.toFixed(2)}.
            </p>
            {ergebnis.ohne_ek > 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {ergebnis.ohne_ek} Position(en) mit Abweichung haben keinen
                Einkaufspreis und fehlen in der Summe.
              </p>
            )}
            {ergebnis.offen > 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {ergebnis.offen} Position(en) blieben ungezählt.
              </p>
            )}
          </div>
        </div>
        <div className="count-wizard-foot">
          <button className="admin-btn admin-btn-primary count-wizard-primary" onClick={onBack}>
            Fertig
          </button>
        </div>
      </div>
    )
  }

  if (fertig) {
    return (
      <div className="count-wizard">
        {kopf}
        <div className="count-wizard-body">
          <div className="count-wizard-summary">
            <div className="count-wizard-summary-big">{gezaehlt} gezählt</div>
            <p>
              {offeneZahl === 0
                ? 'Alle Positionen sind erfasst.'
                : `${offeneZahl} übersprungen — für sie wird nichts gebucht.`}
            </p>
          </div>
          {fehler && <div className="count-wizard-error">{fehler}</div>}
        </div>
        <div className="count-wizard-foot">
          <button className="admin-btn admin-btn-secondary" onClick={zurueck} disabled={busy}>
            Zurück
          </button>
          {offeneZahl > 0 && (
            <button className="admin-btn admin-btn-secondary" onClick={zuDenOffenen} disabled={busy}>
              Übersprungene nochmals
            </button>
          )}
          <button
            className="admin-btn admin-btn-primary count-wizard-primary"
            onClick={() => setAbschlussFrage(true)}
            disabled={busy || gezaehlt === 0}
            title={gezaehlt === 0 ? 'Noch nichts gezählt' : undefined}
          >
            Abschliessen
          </button>
        </div>
        {abschlussFrage && (
          <AbschlussDialog
            detail={detail}
            busy={busy}
            onConfirm={() => { void abschliessen() }}
            onCancel={() => setAbschlussFrage(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="count-wizard">
      {kopf}
      <div className="count-wizard-body">
        {item?.image_url ? (
          <img className="count-wizard-image" src={item.image_url} alt="" />
        ) : (
          <div className="count-wizard-placeholder">Kein Bild hinterlegt</div>
        )}

        <div>
          <div className="count-wizard-name">
            {item?.name}
            {item && uebernommen.has(item.material_id) && (
              <span className="count-wizard-badge" title="Blieb bei der letzten Tranche offen">
                übernommen
              </span>
            )}
          </div>
          <div className="count-wizard-meta">
            {item?.art_nr}{item?.kategorie ? ` · ${item.kategorie}` : ''}
            {` · Position ${idx + 1} von ${gesamt}`}
          </div>
        </div>

        <div className={`count-wizard-field${fehler ? ' has-error' : ''}`}>
          <input
            ref={feld}
            autoFocus
            type="text"
            inputMode="decimal"
            aria-label={`Gezählte Menge ${item?.name ?? ''}`}
            value={entwurf}
            onChange={e => { setEntwurf(e.target.value); setFehler('') }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void speichernUndWeiter()
              }
            }}
          />
          <span className="count-wizard-unit">{item?.unit || 'Stück'}</span>
        </div>

        {fehler && <div className="count-wizard-error">{fehler}</div>}

        {notizOffen ? (
          <textarea
            className="count-wizard-note"
            aria-label="Notiz zur Position"
            placeholder="z.B. Regal 3 unten, 2 beschädigt"
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
          />
        ) : (
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setNotizOffen(true)}
          >
            Notiz hinzufügen
          </button>
        )}
      </div>

      <div className="count-wizard-foot">
        <button className="admin-btn admin-btn-secondary" onClick={zurueck} disabled={busy}>
          {idx === 0 ? 'Zurück' : '←'}
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={() => { void ueberspringen() }}
          disabled={busy}
        >
          Überspringen
        </button>
        <button
          className="admin-btn admin-btn-primary count-wizard-primary"
          onClick={() => { void speichernUndWeiter() }}
          disabled={busy}
        >
          {fehler ? 'Nochmals versuchen' : 'Weiter'}
        </button>
      </div>
    </div>
  )
}
