// Lagerbestand: Korrekturbuchungen (Modul `inventory`).
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export type StockMovementType = 'adjustment' | 'purchase' | 'consumption' | 'return'

/**
 * Bucht eine Bestandsänderung. `quantityDelta` ist die DIFFERENZ, nicht der neue
 * Bestand: der Server addiert und schreibt die Bewegung mit — so bleibt die
 * Historie nachvollziehbar und zwei gleichzeitige Korrekturen überschreiben sich
 * nicht gegenseitig.
 */
export async function adjustStock(
  artNr: string,
  quantityDelta: number,
  opts: { movementType?: StockMovementType; note?: string | null } = {},
): Promise<void> {
  await apiFetch('/pwa/admin/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify({
      art_nr: artNr,
      quantity_delta: quantityDelta,
      movement_type: opts.movementType ?? 'adjustment',
      note: opts.note ?? null,
    }),
  })
}
