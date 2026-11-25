// Anzeigetext der Kalkulation (Maske «Offerte neu», docs/specs/offerte-neu.md §5).
// Reine Funktionen ohne React — eigene Datei, damit die Komponenten-Dateien nur
// Komponenten exportieren (Fast Refresh) und der Text ohne Rendern testbar bleibt.

import type { QuotePreview } from '../../../../api/admin/quotes'
import { fmtCHF } from '../../../utils/format'

/** Prozent mit höchstens einer Nachkommastelle, ohne «.0» (22.03 → «22 %»). */
export function pct(n: number): string {
  const r = Math.round(n * 10) / 10
  return `${Number.isInteger(r) ? r : r.toFixed(1)} %`
}

/** Satz der MwSt aus der Vorschau — ohne Netto kein Satz. */
export function mwstSatz(v: QuotePreview): string {
  return v.netto > 0 ? pct(Math.round((v.mwst / v.netto) * 1000) / 10) : ''
}

/** Rückmeldung zum Fixpreis, bevor gespeichert wird. Null = kein Fixpreis. */
export function fixpreisText(v: QuotePreview): { ok: boolean; text: string } | null {
  const f = v.fixpreis
  if (!f) return null
  if (f.erreicht) {
    return { ok: true, text: `Geht auf: entspricht ${pct(f.rabatt_pct)} Rabatt auf die Waren (${fmtCHF(f.rabatt_betrag)}).` }
  }
  if (v.total < f.betrag) {
    return { ok: false, text: `Liegt über der Kalkulation. Einen Zuschlag gibt es nicht — das Total bleibt ${fmtCHF(v.total)}.` }
  }
  return { ok: false, text: `Zu tief: Arbeit und Pauschalen allein ergeben schon mehr. Das Total wäre ${fmtCHF(v.total)}.` }
}
