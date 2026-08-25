// Einheiten-Vokabular (Stk, m, kg …) hinter den Material-Dropdowns.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'

export interface Unit {
  id: string
  code: string
  sort_order: number
  is_active: boolean
  // Anzahl Materialien mit dieser Einheit — Löschen ist gesperrt, solange > 0.
  usage_count: number
}

// Antwort des Umbenennens: `action: 'merge'`, wenn der Ziel-Code schon existierte
// und die beiden Einheiten zusammengeführt wurden; `migrated` = Anzahl
// Materialien, die dabei umgestellt wurden.
export interface UnitRenameResult {
  action?: string
  migrated?: number
}

export async function listUnits(): Promise<Unit[]> {
  return apiFetch<Unit[]>('/pwa/admin/units')
}

/**
 * Nimmt eine Einheit ins Vokabular auf. Der Material-Dialog ruft das
 * best-effort auf, wenn jemand eine neue Einheit eintippt — ein 409 (existiert
 * schon) ist dort erwartet und wird verschluckt.
 */
export async function createUnit(code: string): Promise<void> {
  await apiFetch('/pwa/admin/units', { method: 'POST', body: JSON.stringify({ code }) })
}

/** Wirkt auf alle Materialien mit dem alten Code; existiert der neue Code schon, führt der Server zusammen. */
export async function renameUnit(id: string, code: string): Promise<UnitRenameResult> {
  return apiFetch<UnitRenameResult>(`/pwa/admin/units/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ code }),
  })
}

/** Nur möglich, solange die Einheit von keinem Material verwendet wird (sonst 400). */
export async function deleteUnit(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/units/${id}`, { method: 'DELETE' })
}
