// Personal → Tab «Skill-Matrix»: wer kann was — als Pillen je Mitarbeiter.
// Spec: docs/specs/mitarbeiterdisposition-faehigkeiten-routen.md §4, §10.
//
// Eine Pille ist ein Lieferant (Griesser, Stobag …) oder eine Tätigkeit
// (Insektenschutzgitter, Ausmessen …). Jede Pille speichert für sich, kein
// Formular. Eine Pille sagt «kann das», nicht «ist gut»; das steht bewusst im
// Kopf des Tabs und nicht nur in der Spec.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  APPOINTMENT_KIND_LABELS, SKILL_ART_LABELS,
  createSkill, deleteSkill, getSkillMatrix, reorderSkills, setStaffSkill, updateSkill,
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

const KINDS = Object.keys(APPOINTMENT_KIND_LABELS) as AppointmentKind[]

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
            Wer kann was — Lieferanten und Tätigkeiten als Pillen. Damit zeigen Projekt und
            Einsatzplanung, wer für einen Einsatz passt. Eine Pille sagt «kann das» und ist{' '}
            <strong>keine Leistungsbewertung</strong>; sichtbar nur im Admin, nie in der Monteur-App.
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
                    {pillen.length === 0 && <span className="skill-pill-leer">noch keine Pillen</span>}
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

function KindChips({ werte, onChange, disabled, name }: {
  werte: AppointmentKind[]
  onChange: (neu: AppointmentKind[]) => void
  disabled?: boolean
  name: string
}) {
  return (
    <div className="skill-kinds" role="group" aria-label={`${name}: immer nötig bei`}>
      {KINDS.map(k => {
        const an = werte.includes(k)
        return (
          <button key={k} type="button" disabled={disabled} aria-pressed={an}
            className={`skill-kind${an ? ' an' : ''}`}
            onClick={() => onChange(an ? werte.filter(x => x !== k) : [...werte, k])}>
            {APPOINTMENT_KIND_LABELS[k]}
          </button>
        )
      })}
    </div>
  )
}

function SkillKatalog({ skills, onGeaendert, showToast }: {
  skills: Skill[]
  onGeaendert: () => Promise<void>
  showToast: ToastFn
}) {
  const [label, setLabel] = useState('')
  const [art, setArt] = useState<SkillArt>('lieferant')
  const [mitAblauf, setMitAblauf] = useState(false)
  const [kinds, setKinds] = useState<AppointmentKind[]>([])
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
      await createSkill({ label: name, art, requires_validity: mitAblauf, einsatz_kinds: kinds })
      setLabel(''); setMitAblauf(false); setKinds([])
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

  function verschieben(i: number, dir: -1 | 1) {
    const ids = skills.map(s => s.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void aktion(() => reorderSkills(ids), null, 'Reihenfolge nicht gespeichert.')
  }

  function loeschen(s: Skill) {
    if (!window.confirm(`«${s.label}» löschen? Die Pille verschwindet bei allen Mitarbeitern und Projekten.\n\nWer sie behalten will, nimmt stattdessen das Häkchen «aktiv» weg.`)) return
    void aktion(() => deleteSkill(s.id), `«${s.label}» gelöscht`, 'Nicht gelöscht.')
  }

  return (
    <section className="skill-katalog">
      <h3 className="skill-katalog-titel">Pillen verwalten</h3>
      <p className="skill-katalog-hilfe">
        «Immer nötig bei» gilt unabhängig vom Projekt — typisch «Ausmessen» beim Ausmass. Ein Ausmass
        braucht nur diese Pillen; ab der Montage kommen die Pillen hinzu, die am Projekt hängen.
      </p>
      {skills.length > 0 && (
        <ul className="skill-katalog-liste">
          {skills.map((s, i) => (
            <li key={s.id} className={`skill-katalog-eintrag${s.is_active ? '' : ' inaktiv'}`}>
              <div className="skill-katalog-zeile">
                <div className="skill-rang">
                  <button className="admin-btn-icon" aria-label={`«${s.label}» nach oben`} title="Nach oben"
                    disabled={i === 0 || laeuft} onClick={() => verschieben(i, -1)}>↑</button>
                  <button className="admin-btn-icon" aria-label={`«${s.label}» nach unten`} title="Nach unten"
                    disabled={i === skills.length - 1 || laeuft} onClick={() => verschieben(i, 1)}>↓</button>
                </div>
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
              </div>
              <div className="skill-katalog-zeile">
                <span className="skill-katalog-label">Immer nötig bei</span>
                <KindChips werte={s.einsatz_kinds} disabled={laeuft} name={s.label}
                  onChange={neu => void aktion(() => updateSkill(s.id, { einsatz_kinds: neu }), null, 'Nicht gespeichert.')} />
              </div>
              <div className="skill-katalog-zeile">
                <label className="skill-check">
                  <input type="checkbox" checked={s.requires_validity} disabled={laeuft}
                    onChange={e => void aktion(() => updateSkill(s.id, { requires_validity: e.target.checked }), null, 'Nicht gespeichert.')} />
                  Zertifikat mit Ablaufdatum
                </label>
                <label className="skill-check">
                  <input type="checkbox" checked={s.is_active} disabled={laeuft}
                    onChange={e => void aktion(() => updateSkill(s.id, { is_active: e.target.checked }), null, 'Nicht gespeichert.')} />
                  aktiv
                </label>
                <button className="admin-btn admin-btn-danger admin-btn-sm skill-loeschen" disabled={laeuft}
                  onClick={() => loeschen(s)}>Löschen</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={e => void anlegen(e)} className="skill-neu">
        <div className="skill-katalog-zeile">
          <div className="admin-form-group" style={{ margin: 0, flex: '1 1 180px' }}>
            <label className="admin-form-label" htmlFor="skill-neu-name">Neue Pille</label>
            <input id="skill-neu-name" className="admin-form-input" value={label} maxLength={60}
              onChange={e => setLabel(e.target.value)} placeholder="z.B. Griesser, Insektenschutzgitter" />
          </div>
          <div className="admin-form-group" style={{ margin: 0 }}>
            <label className="admin-form-label" htmlFor="skill-neu-art">Art</label>
            <select id="skill-neu-art" className="admin-form-select" value={art} onChange={e => setArt(e.target.value as SkillArt)}>
              {(Object.keys(SKILL_ART_LABELS) as SkillArt[]).map(a => <option key={a} value={a}>{SKILL_ART_LABELS[a]}</option>)}
            </select>
          </div>
        </div>
        <div className="skill-katalog-zeile">
          <span className="skill-katalog-label">Immer nötig bei</span>
          <KindChips werte={kinds} onChange={setKinds} name="Neue Pille" />
        </div>
        <div className="skill-katalog-zeile">
          <label className="skill-check">
            <input type="checkbox" checked={mitAblauf} onChange={e => setMitAblauf(e.target.checked)} />
            Zertifikat mit Ablaufdatum
          </label>
          <button className="admin-btn admin-btn-secondary" type="submit" disabled={laeuft || !label.trim()}>
            + Pille
          </button>
        </div>
      </form>
    </section>
  )
}
