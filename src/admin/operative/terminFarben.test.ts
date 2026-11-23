// Terminfarben (docs/specs/termin-farbkategorien.md): Kachelfarbe im Plan,
// Schriftfarbe auf hellen Flächen, Entwurf ↔ Payload, Prüfung im Reiter.
import { describe, it, expect } from 'vitest'
import type { ProjectAppointment } from '../../api/admin'
import type { ScheduleProject } from '../../api/admin/projects'
import { appointmentEntries } from './scheduleScreenModel'
import { pillBg, pillClass, KIND_COLORS } from './scheduleShared'
import { farbeJeKategorie, istHell } from './terminFarben'
import { apptToDraft, draftPayload, emptyDraft, sameDraft } from './projectAppointments'
import { fehlerDerListe, markierungSetzen, standardSetzen } from '../configuration/tabs/TerminFarbenTab'

function appt(over: Partial<ProjectAppointment> = {}): ProjectAppointment {
  return {
    id: 'a1', project_id: 'p1', start_date: '2026-11-16', end_date: null,
    start_time: null, end_time: null, kind: 'montage', label: null, monteur_ids: null,
    ...over,
  }
}

const PROJEKT = { id: 'p1', name: 'Büro', kind: 'teamsitzung', monteur_ids: ['m1'] } as unknown as ScheduleProject

const FARBEN = farbeJeKategorie([
  { key: 'buero', label: 'Büro', color: '#fdba74' },
  { key: 'schulung', label: 'Schulung', color: '#1d4ed8' },
])

describe('Kachelfarbe im Plan', () => {
  it('die Terminfarbe schlägt die Farbe der Einsatz-Art', () => {
    const [e] = appointmentEntries([PROJEKT], [appt({ color_category: 'schulung' })], FARBEN)
    expect(e.termin_farbe).toBe('#1d4ed8')
    expect(pillBg(e)).toBe('#1d4ed8')
  })
  it('ohne Farbe, ohne Feature (keine Liste) oder mit gelöschtem Schlüssel: Farbe der Art', () => {
    const ohne = appointmentEntries([PROJEKT], [appt()], FARBEN)[0]
    const ohneFeature = appointmentEntries([PROJEKT], [appt({ color_category: 'buero' })])[0]
    const geloescht = appointmentEntries([PROJEKT], [appt({ color_category: 'weg' })], FARBEN)[0]
    for (const e of [ohne, ohneFeature, geloescht]) {
      expect(e.termin_farbe).toBeUndefined()
      expect(pillBg(e)).toBe(KIND_COLORS.teamsitzung)
    }
  })
  it('helle Farbe bekommt dunkle Schrift, dunkle nicht', () => {
    const [hell] = appointmentEntries([PROJEKT], [appt({ color_category: 'buero' })], FARBEN)
    const [dunkel] = appointmentEntries([PROJEKT], [appt({ color_category: 'schulung' })], FARBEN)
    expect(pillClass(hell)).toBe(' tf-hell')
    expect(pillClass(dunkel)).toBe('')
  })
  it('ein Blocker bleibt schraffiert, auch mit heller Terminfarbe', () => {
    const blocker = { ...PROJEKT, kind: 'blocker' } as unknown as ScheduleProject
    const [e] = appointmentEntries([blocker], [appt({ color_category: 'buero' })], FARBEN)
    expect(pillClass(e)).toBe(' provisional tf-hell')
  })
})

describe('Standardfarbe der Kundeneinsätze (Spec §8)', () => {
  const MIT_STANDARD = farbeJeKategorie([
    { key: 'buero', label: 'Büro', color: '#fdba74' },
    { key: 'geplant', label: 'Geplante Einsätze', color: '#facc15', standard: true },
  ])
  const KUNDE = { ...PROJEKT, kind: 'project' } as unknown as ScheduleProject

  it('ein Kundeneinsatz ohne eigene Farbe wird gelb, mit dunkler Schrift', () => {
    const [e] = appointmentEntries([KUNDE], [appt()], MIT_STANDARD)
    expect(pillBg(e)).toBe('#facc15')
    expect(pillClass(e)).toBe(' tf-hell')
  })
  it('auch ohne gesetzte Art (Altdaten) gilt das Projekt als Kundeneinsatz', () => {
    const ohneArt = { ...PROJEKT, kind: null } as unknown as ScheduleProject
    expect(appointmentEntries([ohneArt], [appt()], MIT_STANDARD)[0].termin_farbe).toBe('#facc15')
  })
  it('eine eigene Terminfarbe schlägt den Standard', () => {
    const [e] = appointmentEntries([KUNDE], [appt({ color_category: 'buero' })], MIT_STANDARD)
    expect(e.termin_farbe).toBe('#fdba74')
  })
  it('interne Einsätze und Kunden ohne Standard bleiben bei der Farbe der Art', () => {
    expect(appointmentEntries([PROJEKT], [appt()], MIT_STANDARD)[0].termin_farbe).toBeUndefined()
    expect(appointmentEntries([KUNDE], [appt()], FARBEN)[0].termin_farbe).toBeUndefined()
  })
  it('im Reiter ist höchstens eine Zeile Standard', () => {
    const zeilen = [
      { label: 'A', color: '#000000', standard: true },
      { label: 'B', color: '#000000' },
    ]
    expect(standardSetzen(zeilen, 1).map(z => z.standard)).toEqual([false, true])
    expect(standardSetzen(zeilen, -1).map(z => z.standard)).toEqual([false, false])
  })
})

describe('istHell', () => {
  it.each([
    ['#ffff00', true],   // Gelb
    ['#bdb76b', true],   // Khaki
    ['#93c5fd', true],   // Hellblau
    ['#fa8072', true],   // Lachs
    ['#1d4ed8', false],  // Blau
    ['#dc2626', false],  // Rot
    ['#16a34a', false],  // Grün
    ['#ea580c', false],  // Dunkelorange
    ['#fdba74', true],   // Hellorange
    ['#d8b4fe', true],   // helles Violett
    [undefined, false],
    ['var(--x)', false],
  ])('%s → %s', (hex, hell) => {
    expect(istHell(hex)).toBe(hell)
  })
})

describe('Termin-Entwurf', () => {
  it('Farbe kommt aus der Zeile und geht in den Payload; leer entfernt sie', () => {
    const d = apptToDraft(appt({ color_category: 'buero' }))
    expect(d.colorCategory).toBe('buero')
    expect(draftPayload(d).color_category).toBe('buero')
    expect(draftPayload({ ...d, colorCategory: '' }).color_category).toBe('')
    expect(draftPayload(emptyDraft()).color_category).toBe('')
  })
  it('eine geänderte Farbe macht die Maske «geändert»', () => {
    const d = apptToDraft(appt())
    expect(sameDraft(d, { ...d, colorCategory: '' })).toBe(true)
    expect(sameDraft(d, { ...d, colorCategory: 'buero' })).toBe(false)
  })
})

describe('Reiter «Terminfarben»: Prüfung vor dem Speichern', () => {
  it('leere und doppelte Namen sperren das Speichern', () => {
    expect(fehlerDerListe([{ label: ' ', color: '#000000' }])).toMatch(/Namen/)
    expect(fehlerDerListe([
      { label: 'Büro', color: '#000000' }, { label: 'büro ', color: '#ffffff' },
    ])).toMatch(/doppelt/)
    expect(fehlerDerListe([{ label: 'x'.repeat(61), color: '#000000' }])).toMatch(/60 Zeichen/)
  })
  it('Standard und Markierung auf derselben Zeile sperren das Speichern (§9)', () => {
    expect(fehlerDerListe([
      { label: 'Geplante Einsätze', color: '#facc15', standard: true, markierung: true },
    ])).toMatch(/nicht zugleich/)
  })
  it('markierungSetzen hält höchstens eine Zeile als Markierung', () => {
    const zeilen = [{ label: 'A', color: '#000000', markierung: true }, { label: 'B', color: '#ffffff' }]
    expect(markierungSetzen(zeilen, 1).map(z => z.markierung)).toEqual([false, true])
    expect(markierungSetzen(zeilen, -1).map(z => z.markierung)).toEqual([false, false])
  })
  it('Gehlhaars Liste ist gültig', () => {
    expect(fehlerDerListe([
      { label: 'Schulung / Schule Lehrlinge', color: '#1d4ed8' },
      { label: 'Reservation (Kunde hat noch nicht bestätigt)', color: '#ea580c' },
    ])).toBe('')
  })
})
