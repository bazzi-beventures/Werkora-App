// Maske «Offerte neu» (Beta `offerte_neu`, docs/specs/offerte-neu.md): die Positionen
// in drei Blöcken und die Kalkulation daneben. Zustand, Entwurf und Speichern bleiben
// in QuoteCreateForm — diese Maske ist nur eine andere Ansicht derselben Zeilen, damit
// ein Zurückschalten auf die alte Maske nichts verliert.

import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { Reorder } from '../../QuoteRowControls'
import type { QuoteMasterData } from '../useQuoteMasterData'
import type { RowList } from '../useRowList'
import type {
  ExtraChargeRow, ExtraProductRow, InstallationRow, LaborRow, MaterialRow, SpecialRow,
} from '../quoteTypes'
import { ArbeitBlock } from './ArbeitBlock'
import { KalkulationsBlock } from './Kalkulation'
import type { RabattFelder, SkontoFelder } from './Kalkulation'
import { PauschalenBlock } from './PauschalenBlock'
import type { OffertenVorschau } from './useOffertenVorschau'
import { WarenBlock } from './WarenBlock'
import type { PdfEinlesen } from './WarenBlock'
import './offerteNeu.css'

export interface OfferteNeuProps {
  /** Wechselt mit dem Projekt — die Rabatte des Projekts werden je Projekt einmal vorbelegt. */
  projektKey: string
  vorschau: OffertenVorschau
  master: QuoteMasterData
  labor: RowList<LaborRow>
  material: RowList<MaterialRow>
  extraProducts: RowList<ExtraProductRow>
  extraCharges: RowList<ExtraChargeRow>
  installation: RowList<InstallationRow>
  special: RowList<SpecialRow>
  materialReorder: Reorder
  extraReorder: Reorder
  pdf: PdfEinlesen
  pdfFileRef: RefObject<HTMLInputElement | null>
  travel: { distanceKm: number | null | undefined; amount: number; checked: boolean; onChange: (v: boolean) => void }
  rabatte: RabattFelder
  skonto: SkontoFelder
  kalkulationRef: RefObject<HTMLElement | null>
}

function rabattHinweis(block: { rabatt_pct: number; rabatt_betrag: number } | undefined): string | undefined {
  if (!block || block.rabatt_betrag <= 0) return undefined
  // Beim Fixpreis ist der Satz 0 und der Betrag abgeleitet.
  if (!block.rabatt_pct) return 'Rabatt aus dem Fixpreis, siehe Kalkulation'
  return `Rabatt ${block.rabatt_pct} % in der Kalkulation`
}

export function OfferteNeuMaske(p: OfferteNeuProps) {
  const { vorschau: v, rechnet, fehler, vorlaeufig } = p.vorschau
  const { rabatte } = p

  // Rabatte des Projekts sichtbar ins Feld legen, statt sie wie die alte Maske still
  // beim Speichern einspringen zu lassen (Spec §3.2). Einmal je Projekt, und nur in
  // leere Felder — eine Eingabe oder ein übernommener Entwurf gehen vor.
  const vorbelegt = useRef<string | null>(null)
  useEffect(() => {
    const pr = v?.projekt_rabatt
    if (!pr || vorlaeufig || !p.projektKey || vorbelegt.current === p.projektKey) return
    vorbelegt.current = p.projektKey
    if (!rabatte.lohn.trim() && pr.lohn_pct) rabatte.setLohn(String(pr.lohn_pct))
    if (!rabatte.waren.trim() && pr.waren_pct) rabatte.setWaren(String(pr.waren_pct))
  }, [v, vorlaeufig, p.projektKey, rabatte])

  const katalogPreise = useMemo(
    () => new Map((v?.katalog_preise ?? []).map(k => [k.art_nr, k.preis])),
    [v],
  )

  return (
    <div className="on-maske">
      <ArbeitBlock labor={p.labor} roles={p.master.roles} montageEnabled={p.master.montageEnabled}
        summe={v?.arbeit.summe ?? null} rabattHinweis={rabattHinweis(v?.arbeit)} />
      <WarenBlock material={p.material} extraProducts={p.extraProducts} master={p.master}
        materialReorder={p.materialReorder} extraReorder={p.extraReorder} katalogPreise={katalogPreise}
        summe={v?.waren.summe ?? null} rabattHinweis={rabattHinweis(v?.waren)} pdf={p.pdf} pdfFileRef={p.pdfFileRef} />
      <PauschalenBlock installation={p.installation} extraCharges={p.extraCharges} special={p.special}
        master={p.master} travel={p.travel} summe={v?.pauschalen.summe ?? null} />
      <KalkulationsBlock vorschau={v} rechnet={rechnet} fehler={fehler} rabatte={rabatte}
        skonto={p.skonto} blockRef={p.kalkulationRef} />
    </div>
  )
}
