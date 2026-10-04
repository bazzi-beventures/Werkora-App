// Erinnerungen (Wiedervorlage) — Modul `reminders`, docs/specs/erinnerungen.md.
//
// Eine Erinnerung hängt an einem Kunden und/oder Projekt, gehört der Person,
// die sie setzt, und meldet sich am Stichtag per Mail + Push bei ihr. Datum
// und Uhrzeit sind Schweizer Ortszeit, so wie eingegeben; den absoluten
// Meldezeitpunkt rechnet der Server (ohne Uhrzeit: 08:00).

import { apiFetch } from '../client'

export interface Reminder {
  id: string
  owner_user_id: string
  created_by_name: string | null
  customer_id: string | null
  project_id: string | null
  text: string
  /** 'JJJJ-MM-TT' */
  due_date: string
  /** 'HH:MM:SS' oder null (= 08:00, ohne Uhrzeit angezeigt) */
  due_time: string | null
  notified_at: string | null
  done_at: string | null
  done_by_name: string | null
  created_at: string
  customer: { id: string; name: string } | null
  project: { id: string; name: string; project_id_text: string | null } | null
}

export interface ReminderTarget {
  customerId?: string
  projectId?: string
}

export interface ReminderInput {
  text: string
  due_date: string
  due_time?: string | null
}

/** Die eigenen offenen Erinnerungen — fürs Dashboard. */
export async function getMyReminders(): Promise<Reminder[]> {
  return apiFetch<Reminder[]>('/pwa/admin/reminders/mine')
}

/** Erinnerungen an einem Kunden oder Projekt, von allen Admin-Konten. */
export async function getReminders(target: ReminderTarget, includeDone = false): Promise<Reminder[]> {
  const params = new URLSearchParams()
  if (target.customerId) params.set('customer_id', target.customerId)
  if (target.projectId) params.set('project_id', target.projectId)
  if (includeDone) params.set('include_done', 'true')
  return apiFetch<Reminder[]>(`/pwa/admin/reminders?${params.toString()}`)
}

export async function createReminder(target: ReminderTarget, input: ReminderInput): Promise<Reminder> {
  return apiFetch<Reminder>('/pwa/admin/reminders', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      customer_id: target.customerId ?? null,
      project_id: target.projectId ?? null,
    }),
  })
}

export async function updateReminder(
  id: string,
  patch: Partial<ReminderInput> & { done?: boolean },
): Promise<Reminder> {
  return apiFetch<Reminder>(`/pwa/admin/reminders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteReminder(id: string): Promise<void> {
  await apiFetch(`/pwa/admin/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
