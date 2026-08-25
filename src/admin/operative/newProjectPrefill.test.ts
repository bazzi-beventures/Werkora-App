import { describe, it, expect, beforeEach } from 'vitest'
import { setNewProjectPrefill, takeNewProjectPrefill, NewProjectPrefill } from './newProjectPrefill'
import { initialProjectForm, isProjectFormDirty } from './projectDetail/projectForm'
import { diffAppointments } from './projectAppointments'
import type { Project } from '../../api/admin/projects'

// Übergabe «Zeitfenster im Kalender aufgezogen → + Neues Projekt anlegen»:
// die Neu-Maske soll Uhrzeit und Monteur schon mitbringen.

const SLOT: NewProjectPrefill = {
  startDate: '2026-08-18',
  endDate: '2026-08-18',
  startTime: '07:30',
  endTime: '12:00',
  monteurIds: ['staff-2'],
}

beforeEach(() => {
  setNewProjectPrefill(null)
})

describe('newProjectPrefill — Übergabe', () => {
  it('liefert die Vorbelegung genau einmal', () => {
    setNewProjectPrefill(SLOT)
    expect(takeNewProjectPrefill()).toEqual(SLOT)
    // Zweiter Zugriff leer: sonst erbte die nächste, von Hand geöffnete
    // Neu-Maske die Zeiten von vorhin.
    expect(takeNewProjectPrefill()).toBeNull()
  })

  it('ist ohne vorheriges Setzen leer', () => {
    expect(takeNewProjectPrefill()).toBeNull()
  })
})

describe('initialProjectForm mit Vorbelegung', () => {
  it('übernimmt Monteur und Zeitfenster als ersten Termin', () => {
    const form = initialProjectForm(null, SLOT)
    expect(form.monteurIds).toEqual(['staff-2'])
    expect(form.appointments).toHaveLength(1)
    const appt = form.appointments[0]
    expect(appt.startDate).toBe('2026-08-18')
    expect(appt.startTime).toBe('07:30')
    expect(appt.endTime).toBe('12:00')
    expect(appt.kind).toBe('montage')
    // Eintägig → endDate bleibt leer ('' = Backend end_date NULL).
    expect(appt.endDate).toBe('')
    // Kein termin-eigenes Team: der Monteur steht schon am Projekt, ein
    // zweites gleich lautendes Team wäre nur Redundanz.
    expect(appt.ownTeam).toBe(false)
  })

  it('behält ein mehrtägiges Zeitfenster', () => {
    const form = initialProjectForm(null, { ...SLOT, endDate: '2026-08-20' })
    expect(form.appointments[0].endDate).toBe('2026-08-20')
  })

  it('markiert die vorbelegte Maske NICHT als geändert', () => {
    // Die Vorbelegung steckt im Baseline — sonst fragt das Verlassen der
    // gerade erst geöffneten Maske nach dem Speichern.
    const baseline = initialProjectForm(null, SLOT)
    expect(isProjectFormDirty(baseline, initialProjectForm(null, SLOT))).toBe(false)
  })

  it('legt den vorbelegten Termin trotz identischem Baseline an', () => {
    // Entwürfe ohne id sind für diffAppointments immer `create` — sonst ginge
    // der vorbelegte Termin beim Speichern verloren.
    const form = initialProjectForm(null, SLOT)
    const diff = diffAppointments(form.appointments, form.appointments)
    expect(diff.create).toHaveLength(1)
    expect(diff.update).toHaveLength(0)
    expect(diff.removeIds).toHaveLength(0)
  })

  it('ignoriert die Vorbelegung bei einem BESTEHENDEN Projekt', () => {
    // Dessen Termine kommen vom Server; eine hängen gebliebene Vorbelegung
    // dürfte sie nicht überschreiben.
    const project = { id: 'p-1', name: 'Fassade', monteur_ids: ['staff-9'] } as unknown as Project
    const form = initialProjectForm(project, SLOT)
    expect(form.monteurIds).toEqual(['staff-9'])
    expect(form.appointments).toEqual([])
  })

  it('bleibt ohne Vorbelegung leer', () => {
    const form = initialProjectForm(null)
    expect(form.monteurIds).toEqual([])
    expect(form.appointments).toEqual([])
  })
})
