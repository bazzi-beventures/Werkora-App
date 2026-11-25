// Kalkulation der Maske «Offerte neu» (docs/specs/offerte-neu.md §5): die
// Aufschlüsselung, wie sie aufs PDF kommt, mit Rabatten, Fixpreis und Skonto direkt
// daneben — vorher standen sie am Formularende, weit weg von jeder Zahl. Dazu die
// Summenleiste, die beim Erfassen unten mitläuft.
//
// Alle Beträge kommen aus der Vorschau des Servers (useOffertenVorschau); hier wird
// nichts gerechnet ausser Anzeigetext.

import type { ReactNode, RefObject } from 'react'
import type { QuotePreview } from '../../../../api/admin/quotes'
import { fmtCHF } from '../../../utils/format'
import { hasFixedPrice } from '../../QuoteFormParts'
import { Feld, Marke } from './Bausteine'
import { fixpreisText, mwstSatz, pct } from './kalkulationText'

export interface RabattFelder {
  lohn: string
  waren: string
  fixpreis: string
  setLohn: (v: string) => void
  setWaren: (v: string) => void
  setFixpreis: (v: string) => void
}

export interface SkontoFelder {
  aktiv: boolean
  pct: string
  tage: string
  fehler: string
  setAktiv: (v: boolean) => void
  setPct: (v: string) => void
  setTage: (v: string) => void
}

function Zeile({ label, betrag, art }: { label: ReactNode; betrag: number; art?: 'minus' | 'stark' | 'total' | 'unter' }) {
  return (
    <div className={`on-summe-zeile${art ? ` on-summe-${art}` : ''}`}>
      <span>{label}</span>
      <span className="on-zahl">{art === 'minus' ? `−${fmtCHF(betrag)}` : fmtCHF(betrag)}</span>
    </div>
  )
}

export function KalkulationsBlock({ vorschau, rechnet, fehler, rabatte, skonto, blockRef }: {
  vorschau: QuotePreview | undefined
  rechnet: boolean
  fehler: boolean
  rabatte: RabattFelder
  skonto: SkontoFelder
  blockRef: RefObject<HTMLElement | null>
}) {
  const v = vorschau
  const fix = v ? fixpreisText(v) : null
  const fixGesetzt = hasFixedPrice(rabatte.fixpreis)
  const projekt = v?.projekt_rabatt
  return (
    <section className="on-block on-kalkulation" aria-label="Kalkulation" ref={blockRef}>
      <div className="on-block-kopf">
        <h4>Kalkulation</h4>
        <span className="on-leise">{fehler ? 'nicht erreichbar' : rechnet ? 'rechnet…' : 'wie auf dem PDF'}</span>
      </div>

      {v ? (
        <div className="on-summe">
          <Zeile label="Arbeit" betrag={v.arbeit.summe} />
          {v.arbeit.rabatt_betrag > 0 && <Zeile label={`Rabatt Arbeit ${pct(v.arbeit.rabatt_pct)}`} betrag={v.arbeit.rabatt_betrag} art="minus" />}
          <Zeile label="Waren" betrag={v.waren.summe} />
          {v.waren.rabatt_betrag > 0 && (
            <Zeile art="minus" betrag={v.waren.rabatt_betrag}
              label={fixGesetzt ? 'Rabatt Waren (aus Fixpreis)' : `Rabatt Waren ${pct(v.waren.rabatt_pct)}`} />
          )}
          <Zeile label="Pauschalen & Spesen" betrag={v.pauschalen.summe} />
          <Zeile label="Netto" betrag={v.netto} art="stark" />
          <Zeile label={`MwSt ${mwstSatz(v)}, auf 5 Rp. gerundet`} betrag={v.mwst} art="unter" />
          <Zeile label="Total inkl. MwSt" betrag={v.total} art="total" />
          {v.endziffern_aufrundung && (
            <p className="on-leise">Beim Speichern wird das Total noch auf die Endziffern aufgerundet; der Betrag steht erst dann fest.</p>
          )}
        </div>
      ) : (
        <p className="on-leise">{fehler ? 'Die Kalkulation ist gerade nicht erreichbar. Erstellen geht trotzdem.' : 'Sobald ein Projekt gewählt ist, steht hier die Kalkulation.'}</p>
      )}

      <div className="on-felder on-felder-3">
        <div>
          <Feld label="Rabatt Arbeit %" zahl value={rabatte.lohn} placeholder="0" onChange={rabatte.setLohn} />
          {!!projekt?.lohn_pct && <span className="on-feld-hinweis">Projekt: {pct(projekt.lohn_pct)}</span>}
        </div>
        <div>
          <Feld label="Rabatt Waren %" zahl value={rabatte.waren} placeholder="0" onChange={rabatte.setWaren}
            disabled={fixGesetzt} title={fixGesetzt ? 'Ein Fixpreis bestimmt den Rabatt auf die Waren' : undefined} />
          {!!projekt?.waren_pct && <span className="on-feld-hinweis">Projekt: {pct(projekt.waren_pct)}</span>}
        </div>
        <Feld label="Fixpreis inkl. MwSt" zahl value={rabatte.fixpreis} title="Optional: der Endbetrag, den der Kunde zahlt" onChange={rabatte.setFixpreis} />
      </div>
      {fix && <p className={`on-hinweis ${fix.ok ? 'on-hinweis-ok' : 'on-hinweis-warn'}`} role="status">{fix.text}</p>}

      <div className="on-skonto">
        <label className="on-check">
          <input type="checkbox" checked={skonto.aktiv} onChange={e => skonto.setAktiv(e.target.checked)} />
          <span>Skonto auf der Offerte ausweisen <span className="on-leise">(ändert das Total nicht)</span></span>
        </label>
        {skonto.aktiv && (
          <div className="on-felder on-felder-3">
            <Feld label="Skonto %" zahl value={skonto.pct} onChange={skonto.setPct} />
            <Feld label="Frist (Tage)" zahl value={skonto.tage} onChange={skonto.setTage} />
          </div>
        )}
        {skonto.fehler && <p role="alert" className="on-hinweis on-hinweis-warn">{skonto.fehler}</p>}
      </div>

      {v && (
        <div className="on-intern">
          <span className="on-intern-titel">Nur intern</span>
          {v.marge.prozent == null ? (
            <p className="on-leise">Rohertrag: keine Ware mit Einkaufspreis.</p>
          ) : (
            <>
              <Zeile label="Waren EK" betrag={v.marge.ek} />
              <Zeile label="Waren VK nach Rabatt" betrag={v.marge.vk_nach_rabatt} />
              <Zeile label={<>Rohertrag Waren <Marke ton="akzent">{pct(v.marge.prozent)}</Marke></>} betrag={v.marge.rohertrag} art="stark" />
            </>
          )}
          {v.marge.zeilen_ohne_ek > 0 && (
            <p className="on-leise">{v.marge.zeilen_ohne_ek} Position{v.marge.zeilen_ohne_ek > 1 ? 'en' : ''} ohne EK nicht eingerechnet.</p>
          )}
        </div>
      )}
    </section>
  )
}

/** Läuft unten mit: Total und Rohertrag, ein Tipp springt zur Kalkulation. */
export function Summenleiste({ vorschau, rechnet, onZurKalkulation }: {
  vorschau: QuotePreview | undefined
  rechnet: boolean
  onZurKalkulation: () => void
}) {
  const marge = vorschau?.marge.prozent
  return (
    <div className="on-leiste">
      <button type="button" className="on-leiste-total" onClick={onZurKalkulation} aria-label="Zur Kalkulation">
        <small>Total inkl. MwSt{rechnet ? ' · rechnet…' : ''}</small>
        <b className="on-zahl">{vorschau ? fmtCHF(vorschau.total) : '—'}</b>
      </button>
      {marge != null && <span className="on-leiste-marge">Rohertrag Waren {pct(marge)}</span>}
      {vorschau?.fixpreis && (
        <Marke ton={vorschau.fixpreis.erreicht ? 'akzent' : 'warn'}>
          {vorschau.fixpreis.erreicht ? 'Fixpreis geht auf' : 'Fixpreis geht nicht auf'}
        </Marke>
      )}
    </div>
  )
}
