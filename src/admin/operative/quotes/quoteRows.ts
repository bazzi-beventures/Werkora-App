// Regeln, die beim Tippen in einer Zeile greifen (Charge H2).

import { parseNum, vkFromEk } from '../../utils/quotePricing'

/** Sobald ein EK gesetzt ist, treibt `EK × (1 + Aufschlag)` den Verkaufspreis.
 *  Ohne EK bleibt der Preis frei von Hand editierbar (klassische freie Position).
 *
 *  Als `normalize` an `useRowList` gehängt — beide Masken, Erstellen und
 *  Bearbeiten, benutzen dieselbe Regel. */
export function applyEkMargin<T extends { ek?: string; margin_pct?: string; unit_price: string }>(
  next: T, patch: Partial<T>,
): T {
  if (('ek' in patch || 'margin_pct' in patch) && next.ek && next.ek.trim() !== '') {
    next.unit_price = String(vkFromEk(parseNum(next.ek), parseNum(next.margin_pct ?? '')))
  }
  return next
}
