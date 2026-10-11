// Skill-Pillen: welche Pillen ein Einsatz braucht und wem welche fehlen.
// Spiegel von services/skill_matrix.py (anforderung, passende) — die Beispiele in
// skillMatch.test.ts sind dieselben wie in tests/unit/test_skill_matrix.py.
//
// Ausmass braucht nur die Pillen, die bei «aufmass» immer nötig sind (typisch
// «Ausmessen»); alle anderen Einsätze dazu die Pillen des Projekts.

import type { Skill, StaffSkill } from '../../api/admin/skills'

export function anforderung(
  kind: string, projektSkillIds: Iterable<string>, skills: Pick<Skill, 'id' | 'einsatz_kinds' | 'is_active'>[],
): string[] {
  const projekt = new Set(projektSkillIds)
  return skills
    .filter(s => s.is_active && ((s.einsatz_kinds as string[]).includes(kind) || (kind !== 'aufmass' && projekt.has(s.id))))
    .map(s => s.id)
}

/** Pillen je Mitarbeiter, abgelaufene Zertifikate zählen nicht. */
export function pillenJeMitarbeiter(cells: Pick<StaffSkill, 'staff_id' | 'skill_id' | 'ablauf'>[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const c of cells) {
    if (c.ablauf === 'abgelaufen') continue
    const set = out.get(c.staff_id) ?? new Set<string>()
    set.add(c.skill_id)
    out.set(c.staff_id, set)
  }
  return out
}

export function fehlende(staffId: string, benoetigt: string[], pillen: Map<string, Set<string>>): string[] {
  const hat = pillen.get(staffId)
  return benoetigt.filter(k => !hat?.has(k))
}
