// Skill-Pillen: eine Pille (Lieferant/Tätigkeit) und die Auswahl aller Pillen.
// Gebraucht im Personal-Tab, im Projekt-Detail und in der Einsatzplanung.
// Spec: docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4.

import { SKILL_ART_LABELS, type Skill, type SkillArt } from '../../api/admin/skills'
import './skillPills.css'

export type PillZustand = 'normal' | 'fehlt' | 'bald' | 'abgelaufen' | 'aus'

export function SkillPill({ skill, zustand = 'normal', zusatz, onClick, title }: {
  skill: Pick<Skill, 'label' | 'art'>
  zustand?: PillZustand
  zusatz?: string
  onClick?: () => void
  title?: string
}) {
  const cls = `skill-pill skill-pill-${skill.art} skill-pill-${zustand}`
  const inhalt = <>{skill.label}{zusatz && <small>{zusatz}</small>}</>
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title}
        aria-pressed={zustand !== 'aus'}>{inhalt}</button>
    )
  }
  return <span className={cls} title={title}>{inhalt}</span>
}

/** Alle aktiven Pillen nach Art gruppiert; gewählte gefüllt, übrige als Umriss. */
export function SkillPillPicker({ skills, gewaehlt, onToggle, disabled = false }: {
  skills: Skill[]
  gewaehlt: Set<string>
  onToggle: (skill: Skill) => void
  disabled?: boolean
}) {
  const aktive = skills.filter(s => s.is_active)
  if (aktive.length === 0) {
    return <div className="skill-pill-leer">Noch keine Skills — sie werden unter Personal → Skill-Matrix angelegt.</div>
  }
  return (
    <div className="skill-pill-picker">
      {(Object.keys(SKILL_ART_LABELS) as SkillArt[]).map(art => {
        const liste = aktive.filter(s => s.art === art)
        if (liste.length === 0) return null
        return (
          <div key={art} className="skill-pill-gruppe">
            <span className="skill-pill-gruppe-titel">{SKILL_ART_LABELS[art]}</span>
            <div className="skill-pills">
              {liste.map(s => (
                <button key={s.id} type="button" disabled={disabled}
                  className={`skill-pill skill-pill-${s.art} ${gewaehlt.has(s.id) ? 'skill-pill-normal' : 'skill-pill-aus'}`}
                  aria-pressed={gewaehlt.has(s.id)} onClick={() => onToggle(s)}>
                  {gewaehlt.has(s.id) ? '✓ ' : '+ '}{s.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
