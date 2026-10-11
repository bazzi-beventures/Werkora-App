// Skill-Pillen: Katalog, Pillen am Mitarbeiter und am Projekt, «wer passt».
// Spec: docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4.
// Lesen darf jedes Adminkonto; Katalog und Mitarbeiter-Pillen schreibt nur die
// Geschäftsleitung (wie Stundensätze), Projekt-Pillen jedes Adminkonto.

import { apiFetch } from '../client'
import type { AppointmentKind } from './scheduling'

export type SkillArt = 'lieferant' | 'taetigkeit'

export const SKILL_ART_LABELS: Record<SkillArt, string> = {
  lieferant: 'Lieferant',
  taetigkeit: 'Tätigkeit',
}

export interface Skill {
  id: string
  key: string
  label: string
  art: SkillArt
  requires_validity: boolean
  /** Einsatz-Typen, für die die Pille immer nötig ist (z. B. «Ausmessen» bei aufmass) */
  einsatz_kinds: AppointmentKind[]
  sort_order: number | null
  is_active: boolean
}

/** Eine Pille an einem Mitarbeiter. */
export interface StaffSkill {
  staff_id: string
  skill_id: string
  valid_until: string | null
  note: string | null
  /** vom Server gerechnet: abgelaufen / in ≤ 60 Tagen */
  ablauf: 'abgelaufen' | 'bald' | null
}

export interface SkillMatrix {
  skills: Skill[]
  staff: { id: string; name: string; funktion: string | null }[]
  cells: StaffSkill[]
  heute: string
}

export interface PassendRow { staff_id: string; name: string; passt: boolean; fehlt: string[] }

export interface ProjectSkills {
  skill_ids: string[]
  /** ohne (gültige) Offerte das Ausmass, sonst die Montage */
  naechster_einsatz: AppointmentKind
  einsaetze: { kind: AppointmentKind; benoetigt: string[]; mitarbeiter: PassendRow[] }[]
}

export async function getSkills(): Promise<{ skills: Skill[] }> {
  return apiFetch<{ skills: Skill[] }>('/pwa/admin/skills')
}

export async function getSkillMatrix(): Promise<SkillMatrix> {
  return apiFetch<SkillMatrix>('/pwa/admin/skill-matrix')
}

export async function setStaffSkill(
  staffId: string, skillId: string, aktiv: boolean, validUntil: string | null = null,
): Promise<StaffSkill & { aktiv: boolean }> {
  return apiFetch(`/pwa/admin/skill-matrix/${staffId}/${skillId}`, {
    method: 'PUT',
    body: JSON.stringify({ aktiv, valid_until: validUntil }),
  })
}

export interface SkillNeu {
  label: string
  art: SkillArt
  requires_validity: boolean
  einsatz_kinds: AppointmentKind[]
}

export async function createSkill(neu: SkillNeu): Promise<Skill> {
  return apiFetch<Skill>('/pwa/admin/skills', { method: 'POST', body: JSON.stringify(neu) })
}

export type SkillPatch = Partial<Pick<Skill, 'label' | 'art' | 'requires_validity' | 'einsatz_kinds' | 'is_active'>>

export async function updateSkill(id: string, felder: SkillPatch): Promise<Skill> {
  return apiFetch<Skill>(`/pwa/admin/skills/${id}`, { method: 'PATCH', body: JSON.stringify(felder) })
}

export async function reorderSkills(ids: string[]): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/pwa/admin/skills/order', { method: 'PUT', body: JSON.stringify({ ids }) })
}

export async function deleteSkill(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/pwa/admin/skills/${id}`, { method: 'DELETE' })
}

export async function getProjectSkills(projectId: string): Promise<ProjectSkills> {
  return apiFetch<ProjectSkills>(`/pwa/admin/projects/${projectId}/skills`)
}

export async function setProjectSkills(projectId: string, skillIds: string[]): Promise<{ skill_ids: string[] }> {
  return apiFetch(`/pwa/admin/projects/${projectId}/skills`, {
    method: 'PUT', body: JSON.stringify({ skill_ids: skillIds }),
  })
}

/** Pillen aller Projekte (Einsatzplanung). */
export async function getAllProjectSkills(): Promise<{ project_skills: { project_id: string; skill_id: string }[] }> {
  return apiFetch('/pwa/admin/project-skills')
}
