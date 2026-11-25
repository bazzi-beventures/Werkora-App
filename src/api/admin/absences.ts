// Absenzen (Ferien/Krankheit): Liste, Entscheid, Ferienanspruch.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.

import { apiFetch } from '../client'
import type { Befund } from './ferienplanung'

export interface Absence {
  id: string
  staff_name: string
  absence_type: string
  start_date: string
  end_date: string
  /** Halber Tag (WW-93): 'am' Vormittag, 'pm' Nachmittag, null/fehlt = ganzer Tag. */
  half_day?: 'am' | 'pm' | null
  status: string
  note: string | null
  /** Kann ICH über diesen Antrag entscheiden? `null` = ja; sonst warum nicht:
   *  `own` (eigener Antrag) oder `no_right` (Modus «nur Berechtigte»).
   *  Fehlt das Feld (älterer Server), gilt «ja». */
  decide_block?: 'own' | 'no_right' | null
  /** Ferienplanung (Modul `ferienplanung`): Befunde des offenen Antrags gegen
   *  Sperrfristen und Regeln. Fehlt ohne Modul. */
  befunde?: Befund[]
}

/** Warum ich über einen Antrag nicht entscheiden kann (`Absence.decide_block`).
 *  Eine Liste für Admin-App und Mitarbeiter-App. */
export const DECIDE_BLOCK_TEXT: Record<string, string> = {
  own: 'Eigener Antrag — gibt jemand anderes frei',
  no_right: 'Freigabe durch berechtigte Personen',
}

export async function getAdminAbsences(status?: string): Promise<Absence[]> {
  const q = status ? `?status=${status}` : ''
  return apiFetch<Absence[]>(`/pwa/admin/absences${q}`)
}

/** `overrideGrund`: Begründung, wenn ein harter Befund der Ferienplanung bewusst
 *  übersteuert wird (wird an der Absenz festgehalten). */
export async function approveAbsence(id: string, note?: string, overrideGrund?: string): Promise<void> {
  await apiFetch(`/pwa/admin/absences/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note, ...(overrideGrund ? { override_grund: overrideGrund } : {}) }),
  })
}

export async function rejectAbsence(id: string, note?: string): Promise<void> {
  await apiFetch(`/pwa/admin/absences/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

