// Projekt-Detail → Karte «Einsatzplanung»: welche Pillen die Arbeit verlangt und
// wer dafür passt. Spec: docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4.
//
// Die Pillen am Projekt beschreiben die Montage (Lieferant, Tätigkeit). Ein Ausmass
// braucht sie nicht — dort zählen nur die Pillen, die beim Ausmass immer nötig sind.
// Solange es keine Offerte gibt, ist das Ausmass der nächste Einsatz.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  APPOINTMENT_KIND_LABELS, getProjectSkills, getSkills, setProjectSkills,
  type PassendRow, type ProjectSkills, type Skill,
} from '../../../api/admin'
import { SkillPill, SkillPillPicker } from '../../components/SkillPills'

const MAX_NAMEN = 6

function fehlerText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function Passende({ rows, labels }: { rows: PassendRow[]; labels: Map<string, string> }) {
  const passen = rows.filter(r => r.passt)
  if (passen.length > 0) {
    const mehr = passen.length - MAX_NAMEN
    return <span>passt: {passen.slice(0, MAX_NAMEN).map(r => r.name).join(', ')}{mehr > 0 ? ` +${mehr}` : ''}</span>
  }
  const naechste = rows.filter(r => r.fehlt.length === rows[0]?.fehlt.length).slice(0, 3)
  if (naechste.length === 0) return <span>keine aktiven Mitarbeiter</span>
  return (
    <span className="project-skills-warnung">
      niemand hat alle Skills — am nächsten:{' '}
      {naechste.map(r => `${r.name} (fehlt ${r.fehlt.map(k => labels.get(k) ?? '?').join(', ')})`).join('; ')}
    </span>
  )
}

export function ProjectSkillsBlock({ projectId }: { projectId: string }) {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [daten, setDaten] = useState<ProjectSkills | null>(null)
  const [fehler, setFehler] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const laden = useCallback(async () => {
    try {
      const [k, d] = await Promise.all([getSkills(), getProjectSkills(projectId)])
      setSkills(k.skills)
      setDaten(d)
      setFehler('')
    } catch (e) {
      setFehler(fehlerText(e, 'Skills nicht ladbar.'))
    }
  }, [projectId])

  useEffect(() => { void laden() }, [laden])

  const labels = useMemo(() => new Map((skills ?? []).map(s => [s.id, s.label])), [skills])
  const byId = useMemo(() => new Map((skills ?? []).map(s => [s.id, s])), [skills])

  async function umschalten(s: Skill) {
    if (!daten) return
    const neu = daten.skill_ids.includes(s.id) ? daten.skill_ids.filter(k => k !== s.id) : [...daten.skill_ids, s.id]
    const vorher = daten
    setDaten({ ...daten, skill_ids: neu })
    setSpeichert(true)
    try {
      await setProjectSkills(projectId, neu)
      setDaten(await getProjectSkills(projectId))
    } catch (e) {
      setDaten(vorher)
      setFehler(fehlerText(e, 'Nicht gespeichert.'))
    } finally {
      setSpeichert(false)
    }
  }

  if (fehler && !daten) return <div className="admin-form-error">{fehler}</div>
  if (!skills || !daten) return null

  return (
    <div className="admin-form-group project-skills">
      <label className="admin-form-label">Skills — was die Montage verlangt</label>
      <SkillPillPicker skills={skills} gewaehlt={new Set(daten.skill_ids)} onToggle={s => void umschalten(s)} disabled={speichert} />
      {fehler && <div className="admin-form-error">{fehler}</div>}
      <ul className="project-skills-einsaetze">
        {daten.einsaetze.map(e => {
          const naechster = e.kind === daten.naechster_einsatz
          return (
            <li key={e.kind} className={naechster ? 'naechster' : undefined}>
              <div className="project-skills-kopf">
                <strong>{APPOINTMENT_KIND_LABELS[e.kind]}</strong>
                {naechster && (
                  <span className="project-skills-badge">
                    nächster Einsatz{e.kind === 'aufmass' ? ' — noch keine Offerte' : ''}
                  </span>
                )}
              </div>
              <div className="skill-pills">
                {e.benoetigt.length === 0
                  ? <span className="skill-pill-leer">keine besonderen Skills nötig</span>
                  : e.benoetigt.map(k => byId.get(k) && <SkillPill key={k} skill={byId.get(k)!} />)}
              </div>
              {e.benoetigt.length > 0 && <div className="project-skills-passt"><Passende rows={e.mitarbeiter} labels={labels} /></div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
