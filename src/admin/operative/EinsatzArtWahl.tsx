import type { Dispatch, SetStateAction } from 'react'
import type { ProjectKind } from '../../api/admin/projects'
import type { TerminFarbe } from '../../api/admin/tenant'
import { PROJECT_KIND_LABELS } from '../utils/project'
import { internalFormTitle, type FormState } from './scheduleScreenModel'

// «Art des Einsatzes» im Planungs-Panel, samt Blocker-Kategorie.
//
// Hat der Betrieb Terminfarben (docs/specs/termin-farbkategorien.md §3.5), SIND sie
// die Arten eines internen Einsatzes: «Büro» wählen setzt Titel und Farbe in einem
// Zug, statt Art, Blocker-Kategorie und Terminfarbe nebeneinander zu fragen. Der
// Einsatz wird als «Sonstiges» gespeichert, die Farbe an seinen Terminen
// (`FormState.terminFarbe`, ProjectScheduleScreen.handleSave). Nur der Blocker bleibt
// eigene Art — er allein wirkt technisch (schraffiert, keine feste Belegung). Eine
// feste Werkora-Art eines bestehenden Einsatzes bleibt als Eintrag stehen, bis
// jemand umstellt. Ohne Terminfarben bleibt alles wie vorher.

const FESTE_ARTEN: ProjectKind[] = [
  'teamsitzung', 'weiterbildung', 'lagerarbeit', 'werkstatt', 'reservation', 'blocker', 'sonstiges',
]
const FESTE_LABELS: Partial<Record<ProjectKind, string>> = {
  weiterbildung: 'Weiterbildung / Kurs',
  werkstatt: 'Werkstatt / Vorbereitung',
  reservation: 'Mitarbeiter-Reservation',
  blocker: 'Blocker (provisorisch)',
}
const label = (k: ProjectKind) => FESTE_LABELS[k] ?? PROJECT_KIND_LABELS[k]
const TF = 'tf:'

export function EinsatzArtWahl({ form, setForm, blockerCategories, terminFarben, farbeBisher }: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState | null>>
  blockerCategories: string[]
  terminFarben: TerminFarbe[]
  /** Farbe der Termine eines bestehenden Einsatzes (erster Termin). */
  farbeBisher?: string | null
}) {
  const mitFarben = terminFarben.length > 0 && form.kind !== 'project'
  const farbe = form.terminFarbe ?? farbeBisher ?? ''
  const kategorie = mitFarben && form.kind !== 'blocker' ? terminFarben.find(k => k.key === farbe) : undefined
  const value = kategorie ? TF + kategorie.key : form.kind

  function waehle(next: string) {
    setForm(f => {
      if (!f) return f
      const titelUnberuehrt = !f.name.trim() || f.name === PROJECT_KIND_LABELS[f.kind]
        || terminFarben.some(k => k.label === f.name)
      if (next.startsWith(TF)) {
        const k = terminFarben.find(x => TF + x.key === next)
        if (!k) return f
        return { ...f, kind: 'sonstiges', name: titelUnberuehrt ? k.label : f.name, terminFarbe: k.key }
      }
      const kind = next as ProjectKind
      // Titel mitziehen, solange er noch der Vorgabe der bisherigen Art entspricht.
      const name = titelUnberuehrt && kind !== 'project' ? internalFormTitle(kind, blockerCategories) : f.name
      return { ...f, kind, name, terminFarbe: mitFarben ? '' : f.terminFarbe }
    })
  }

  return (
    <>
      <label className="project-schedule-field">
        <span>Art des Einsatzes</span>
        <select
          className="admin-input"
          value={value}
          onChange={e => waehle(e.target.value)}
          disabled={!!form.id && form.kind === 'project'}
        >
          {/* «Kundenprojekt» nur zur Anzeige eines bestehenden Kundenprojekts. */}
          {form.kind === 'project' && <option value="project">Kundenprojekt</option>}
          {mitFarben
            ? <>
                {terminFarben.map(k => <option key={k.key} value={TF + k.key}>{k.label}</option>)}
                <option value="blocker">{label('blocker')}</option>
                {!kategorie && form.kind !== 'blocker' && <option value={form.kind}>{label(form.kind)}</option>}
              </>
            : FESTE_ARTEN.map(k => <option key={k} value={k}>{label(k)}</option>)}
        </select>
      </label>

      {/* Blocker-Kategorien (Betreiber → Einsatzplanung) setzen den Titel per
          Auswahl; mit Terminfarben übernimmt die Art diese Rolle. */}
      {form.kind === 'blocker' && !mitFarben && blockerCategories.length > 0 && (
        <label className="project-schedule-field">
          <span>Kategorie</span>
          <select
            className="admin-input"
            value={blockerCategories.includes(form.name) ? form.name : ''}
            onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
          >
            <option value="">— Kategorie wählen —</option>
            {blockerCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
    </>
  )
}
