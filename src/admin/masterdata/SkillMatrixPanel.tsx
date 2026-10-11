// Personal → Tab «Skill-Matrix»: wer kann was — als Pillen je Mitarbeiter.
// Spec: docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4, §10.
//
// Eine Pille ist ein Lieferant (Griesser, Stobag …) oder eine Tätigkeit
// (Insektenschutzgitter, Ausmessen …). Jede Pille speichert für sich, kein
// Formular. Eine Pille sagt «kann das», nicht «ist gut»; das steht bewusst im
// Kopf des Tabs und nicht nur in der Spec.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SKILL_ART_LABELS,
  createSkill, deleteSkill, getSkillMatrix, setStaffSkill, updateSkill,
  type AppointmentKind, type Skill, type SkillArt, type SkillMatrix, type StaffSkill,
} from '../../api/admin'
import { SkillPill, SkillPillPicker } from '../components/SkillPills'
import { useToast, ToastHost, type ToastFn } from '../components/useToast'
import './skillMatrix.css'

function fehlerText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function datumKurz(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

const AUSMASS: AppointmentKind = 'aufmass'

export function SkillMatrixPanel() {
  const [daten, setDaten] = useState<SkillMatrix | null>(null)
  const [fehler, setFehler] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const [filter, setFilter] = useState<Set<string>>(new Set())
  const { toast, showToast } = useToast()

  const laden = useCallback(async () => {
    try {
      setDaten(await getSkillMatrix())
      setFehler('')
    } catch (e) {
      setFehler(fehlerText(e, 'Die Skill-Matrix konnte nicht geladen werden.'))
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  const skillById = useMemo(() => new Map((daten?.skills ?? []).map(s => [s.id, s])), [daten])
  const jePerson = useMemo(() => {
    const m = new Map<string, StaffSkill[]>()
    for (const c of daten?.cells ?? []) m.set(c.staff_id, [...(m.get(c.staff_id) ?? []), c])
    return m
  }, [daten])

  async function setzen(staffId: string, skill: Skill, aktiv: boolean, validUntil: string | null = null) {
    if (!daten) return
    const vorher = daten
    const ohne = daten.cells.filter(c => !(c.staff_id === staffId && c.skill_id === skill.id))
    // Optimistisch: die Pille steht sofort, ein Fehler stellt den alten Stand her.
    setDaten({ ...daten, cells: aktiv ? [...ohne, { staff_id: staffId, skill_id: skill.id, valid_until: validUntil, note: null, ablauf: null }] : ohne })
    try {
      const neu = await setStaffSkill(staffId, skill.id, aktiv, skill.requires_validity ? validUntil : null)
      setDaten(d => d && {
        ...d,
        cells: [...d.cells.filter(c => !(c.staff_id === staffId && c.skill_id === skill.id)), ...(neu.aktiv ? [neu] : [])],
      })
    } catch (e) {
      setDaten(vorher)
      showToast(fehlerText(e, 'Nicht gespeichert.'), 'error')
    }
  }

  const sichtbar = (daten?.staff ?? []).filter(p => {
    if (filter.size === 0) return true
    const hat = new Set((jePerson.get(p.id) ?? []).filter(c => c.ablauf !== 'abgelaufen').map(c => c.skill_id))
    return [...filter].every(k => hat.has(k))
  })

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Skill-Matrix</div>
          <div className="admin-page-subtitle">
            Wer kann was — Lieferanten und Tätigkeiten. Projekt und Einsatzplanung zeigen damit, wer
            passt. Keine Leistungsbewertung; sichtbar nur im Admin.
          </div>
        </div>
      </div>

      {fehler && (
        <div className="admin-form-error" style={{ marginBottom: 16 }}>
          {fehler} <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => void laden()}>Erneut versuchen</button>
        </div>
      )}
      {!daten && !fehler && <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>}

      {daten && daten.skills.some(s => s.is_active) && (
        <div className="skill-filter">
          <span className="skill-filter-titel">Wer kann …</span>
          <div className="skill-pills">
            {daten.skills.filter(s => s.is_active).map(s => (
              <SkillPill key={s.id} skill={s} zustand={filter.has(s.id) ? 'normal' : 'aus'}
                onClick={() => setFilter(f => { const n = new Set(f); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} />
            ))}
          </div>
          {filter.size > 0 && (
            <span className="skill-filter-treffer">{sichtbar.length} von {daten.staff.length}
              {' · '}<button type="button" className="skill-link" onClick={() => setFilter(new Set())}>alle zeigen</button></span>
          )}
        </div>
      )}

      {daten && (daten.staff.length === 0 ? (
        <div className="admin-table-empty">Keine aktiven Mitarbeiter.</div>
      ) : (
        <ul className="skill-personen">
          {sichtbar.map(p => {
            const pillen = (jePerson.get(p.id) ?? [])
              .filter(c => skillById.get(c.skill_id)?.is_active)
              .sort((a, b) => (skillById.get(a.skill_id)?.sort_order ?? 0) - (skillById.get(b.skill_id)?.sort_order ?? 0))
            const gewaehlt = new Set(pillen.map(c => c.skill_id))
            const bearbeiten = offen === p.id
            return (
              <li key={p.id} className="skill-person">
                <div className="skill-person-kopf">
                  <div className="skill-person-name">
                    <strong>{p.name}</strong>
                    {p.funktion && <small>{p.funktion}</small>}
                  </div>
                  <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                    aria-expanded={bearbeiten} onClick={() => setOffen(bearbeiten ? null : p.id)}>
                    {bearbeiten ? 'Fertig' : 'Bearbeiten'}
                  </button>
                </div>
                {!bearbeiten && (
                  <div className="skill-pills">
                    {pillen.length === 0 && <span className="skill-pill-leer">noch keine Skills</span>}
                    {pillen.map(c => {
                      const s = skillById.get(c.skill_id)!
                      return (
                        <SkillPill key={c.skill_id} skill={s} zustand={c.ablauf ?? 'normal'}
                          zusatz={c.valid_until ? `bis ${datumKurz(c.valid_until)}` : undefined}
                          title={c.ablauf === 'abgelaufen' ? 'Zertifikat abgelaufen' : c.ablauf === 'bald' ? 'läuft in den nächsten 60 Tagen ab' : undefined} />
                      )
                    })}
                  </div>
                )}
                {bearbeiten && (
                  <>
                    <SkillPillPicker skills={daten.skills} gewaehlt={gewaehlt}
                      onToggle={s => void setzen(p.id, s, !gewaehlt.has(s.id))} />
                    {pillen.filter(c => skillById.get(c.skill_id)?.requires_validity).map(c => (
                      <label key={c.skill_id} className="skill-gueltig">
                        <span>{skillById.get(c.skill_id)!.label} gültig bis</span>
                        <input type="date" className="admin-form-input" value={c.valid_until ?? ''}
                          aria-label={`${p.name}: ${skillById.get(c.skill_id)!.label} gültig bis`}
                          onChange={e => void setzen(p.id, skillById.get(c.skill_id)!, true, e.target.value || null)} />
                      </label>
                    ))}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ))}

      {daten && <SkillKatalog skills={daten.skills} onGeaendert={laden} showToast={showToast} />}

      <ToastHost toast={toast} />
    </>
  )
}

function SkillKatalog({ skills, onGeaendert, showToast }: {
  skills: Skill[]
  onGeaendert: () => Promise<void>
  showToast: ToastFn
}) {
  const [label, setLabel] = useState('')
  const [art, setArt] = useState<SkillArt>('lieferant')
  const [ausmass, setAusmass] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [namen, setNamen] = useState<Record<string, string>>({})

  async function aktion(fn: () => Promise<unknown>, erfolg: string | null, fallback: string) {
    setLaeuft(true)
    try {
      await fn()
      if (erfolg) showToast(erfolg)
      await onGeaendert()
    } catch (e) {
      showToast(fehlerText(e, fallback), 'error')
    } finally {
      setLaeuft(false)
    }
  }

  async function anlegen(e: React.FormEvent) {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    await aktion(async () => {
      await createSkill({ label: name, art, requires_validity: false, einsatz_kinds: ausmass ? [AUSMASS] : [] })
      setLabel(''); setAusmass(false)
    }, `«${name}» angelegt`, 'Nicht angelegt.')
  }

  function namenWeg(id: string) {
    setNamen(n => { const rest = { ...n }; delete rest[id]; return rest })
  }

  function umbenennen(s: Skill) {
    const neu = (namen[s.id] ?? s.label).trim()
    if (!neu || neu === s.label) { namenWeg(s.id); return }
    void aktion(() => updateSkill(s.id, { label: neu }), 'Umbenannt', 'Nicht umbenannt.').then(() => namenWeg(s.id))
  }

  /** «Nötig fürs Ausmass» schaltet nur den Ausmass-Eintrag — andere Einsatz-Typen bleiben, wie sie sind. */
  function ausmassUmschalten(s: Skill, an: boolean) {
    const ohne = s.einsatz_kinds.filter(k => k !== AUSMASS)
    void aktion(() => updateSkill(s.id, { einsatz_kinds: an ? [AUSMASS, ...ohne] : ohne }), null, 'Nicht gespeichert.')
  }

  function loeschen(s: Skill) {
    if (!window.confirm(`«${s.label}» löschen? Der Skill verschwindet bei allen Mitarbeitern und Projekten.`)) return
    void aktion(() => deleteSkill(s.id), `«${s.label}» gelöscht`, 'Nicht gelöscht.')
  }

  return (
    <section className="skill-katalog">
      <h3 className="skill-katalog-titel">Skills verwalten</h3>
      <p className="skill-katalog-hilfe">
        Ein Ausmass braucht nur die Skills mit Häkchen «fürs Ausmass». Ab der Montage zählen die
        Skills, die am Projekt hängen.
      </p>
      {skills.length > 0 && (
        <ul className="skill-katalog-liste">
          {skills.map(s => (
            <li key={s.id} className="skill-katalog-eintrag">
              <input className="admin-form-input skill-katalog-name" value={namen[s.id] ?? s.label} maxLength={60}
                aria-label={`Name ${s.label}`}
                onChange={e => setNamen(n => ({ ...n, [s.id]: e.target.value }))}
                onBlur={() => umbenennen(s)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              <select className="admin-form-select skill-katalog-art" value={s.art} disabled={laeuft}
                aria-label={`Art ${s.label}`}
                onChange={e => void aktion(() => updateSkill(s.id, { art: e.target.value as SkillArt }), null, 'Nicht gespeichert.')}>
                {(Object.keys(SKILL_ART_LABELS) as SkillArt[]).map(a => <option key={a} value={a}>{SKILL_ART_LABELS[a]}</option>)}
              </select>
              <label className="skill-check">
                <input type="checkbox" checked={s.einsatz_kinds.includes(AUSMASS)} disabled={laeuft}
                  aria-label={`${s.label} fürs Ausmass`}
                  onChange={e => ausmassUmschalten(s, e.target.checked)} />
                fürs Ausmass
              </label>
              <button className="admin-btn-icon skill-loeschen" disabled={laeuft} aria-label={`${s.label} löschen`}
                title="Löschen" onClick={() => loeschen(s)}>×</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={e => void anlegen(e)} className="skill-neu">
        <input className="admin-form-input skill-katalog-name" value={label} maxLength={60}
          aria-label="Neuer Skill" onChange={e => setLabel(e.target.value)} placeholder="Neuer Skill, z.B. Griesser" />
        <select className="admin-form-select skill-katalog-art" value={art} aria-label="Art"
          onChange={e => setArt(e.target.value as SkillArt)}>
          {(Object.keys(SKILL_ART_LABELS) as SkillArt[]).map(a => <option key={a} value={a}>{SKILL_ART_LABELS[a]}</option>)}
        </select>
        <label className="skill-check">
          <input type="checkbox" checked={ausmass} onChange={e => setAusmass(e.target.checked)} />
          fürs Ausmass
        </label>
        <button className="admin-btn admin-btn-secondary" type="submit" disabled={laeuft || !label.trim()}>
          + Skill
        </button>
      </form>
    </section>
  )
}
