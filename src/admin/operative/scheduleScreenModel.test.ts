// Reine Bausteine der Einsatzplanung (Charge M4a): Serienmuster, Termin ↔ Formular,
// Kalender-Einträge, Live-Fenster. Die Abläufe im Screen prüfen weiter die
// ProjectScheduleScreen.*-Tests; hier die Regeln, die beim Herauslösen gleich
// bleiben müssen.
import { describe, expect, it } from 'vitest'
import type { ProjectAppointment } from '../../api/admin'
import type { ScheduleProject } from '../../api/admin/projects'
import {
  apptToForm, appointmentEntries, emptyInternalForm, internalFormTitle, leerbar,
  overlapsWindow, repeatToRecurrence, sameRows, slotToApptForm,
} from './scheduleScreenModel'

function appt(over: Partial<ProjectAppointment> = {}): ProjectAppointment {
  return {
    id: 'a1', project_id: 'p1', start_date: '2026-11-16', end_date: null,
    start_time: null, end_time: null, kind: 'montage', label: null, monteur_ids: null,
    ...over,
  }
}

const PROJEKT = {
  id: 'p1', name: 'MFH Seeblick', kind: 'project', monteur_ids: ['m1'],
} as unknown as ScheduleProject

describe('repeatToRecurrence', () => {
  it('ohne Muster kein Serienwunsch', () => {
    expect(repeatToRecurrence('', '2026-12-31')).toBeNull()
  })
  it('«alle 2 Wochen» ist wöchentlich mit Intervall 2', () => {
    expect(repeatToRecurrence('biweekly', '2026-12-31'))
      .toEqual({ freq: 'weekly', interval: 2, until: '2026-12-31' })
  })
})

describe('overlapsWindow', () => {
  it('eintägiger Termin zählt nur im Fenster', () => {
    expect(overlapsWindow(appt(), '2026-11-01', '2026-11-30')).toBe(true)
    expect(overlapsWindow(appt(), '2026-11-17', '2026-11-30')).toBe(false)
  })
  it('mehrtägiger Termin ragt ins Fenster hinein', () => {
    expect(overlapsWindow(appt({ start_date: '2026-10-28', end_date: '2026-11-02' }),
      '2026-11-01', '2026-11-30')).toBe(true)
  })
})

describe('appointmentEntries', () => {
  it('ein Eintrag je Termin, Team fällt auf das Projekt-Team zurück', () => {
    const [e] = appointmentEntries([PROJEKT], [appt()])
    expect(e.id).toBe('a1')
    expect(e.end_date).toBe('2026-11-16')
    expect(e.monteur_ids).toEqual(['m1'])
    expect(e.termin_badge).toBeUndefined()
  })
  it('Termine unbekannter (gefilterter) Projekte fehlen', () => {
    expect(appointmentEntries([], [appt()])).toEqual([])
  })
})

describe('Formulare', () => {
  it('bestehender Serientermin übernimmt das Serienende', () => {
    const f = apptToForm(appt({ series_id: 's1', series_rule: { freq: 'weekly', interval: 1, until: '2026-12-31' } }))
    expect(f.seriesId).toBe('s1')
    expect(f.seriesUntil).toBe('2026-12-31')
    expect(f.seriesUntilOriginal).toBe('2026-12-31')
    expect(f.scope).toBe('single')
  })
  it('aufgezogener Slot verlangt einen Monteur', () => {
    const f = slotToApptForm({ startDate: '2026-11-16', endDate: '2026-11-16', startTime: '08:00', endTime: '12:00', monteurIds: [] })
    expect(f.requireMonteur).toBe(true)
    expect(f.ownTeam).toBe(false)
  })
  it('Blocker mit gepflegten Kategorien startet ohne Titel', () => {
    expect(internalFormTitle('blocker', ['Ferien'])).toBe('')
    expect(emptyInternalForm('blocker', ['Ferien']).name).toBe('')
  })
  it('geleertes Feld: beim Ändern "", beim Anlegen null', () => {
    expect(leerbar('', true)).toBe('')
    expect(leerbar('', false)).toBeNull()
    expect(leerbar('x', false)).toBe('x')
  })
})

describe('sameRows', () => {
  it('gleicher Inhalt in neuem Array gilt als gleich', () => {
    expect(sameRows([{ a: 1 }], [{ a: 1 }])).toBe(true)
    expect(sameRows([{ a: 1 }], [{ a: 2 }])).toBe(false)
  })
})
