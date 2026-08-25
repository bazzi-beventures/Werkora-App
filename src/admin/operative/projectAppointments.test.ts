import { describe, it, expect } from 'vitest'
import {
  AppointmentDraft, applyStartDate, apptToDraft, diffAppointments, draftPayload, draftTeamNames,
  draftTitle, emptyDraft, fmtDraftWhen, nextAppointment, normalizeDrafts, sortDrafts, todayISO,
  validateDrafts,
} from './projectAppointments'
import type { ProjectAppointment } from '../../api/admin'

function draft(over: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return { ...emptyDraft(), startDate: '2026-08-18', ...over }
}

describe('apptToDraft', () => {
  it('übernimmt Zeitstempel gekürzt und leitet «eigenes Team» aus monteur_ids ab', () => {
    const row: ProjectAppointment = {
      id: 'a-1', project_id: 'p-1',
      start_date: '2026-08-18', end_date: null,
      start_time: '07:30:00', end_time: '12:00:00',
      kind: 'aufmass', label: null, monteur_ids: ['s-1'],
    }
    expect(apptToDraft(row)).toMatchObject({
      key: 'a-1', id: 'a-1', startDate: '2026-08-18', endDate: '',
      startTime: '07:30', endTime: '12:00', kind: 'aufmass', label: '',
      ownTeam: true, monteurIds: ['s-1'],
    })
  })

  it('ohne Termin-Team gilt das Projekt-Team (ownTeam false)', () => {
    const row: ProjectAppointment = {
      id: 'a-2', project_id: 'p-1', start_date: '2026-08-18', end_date: null,
      start_time: null, end_time: null, kind: 'montage', label: null, monteur_ids: null,
    }
    expect(apptToDraft(row).ownTeam).toBe(false)
    expect(apptToDraft(row).monteurIds).toEqual([])
  })
})

describe('draftPayload', () => {
  it('sendet leere Felder als \'\' — nur so löscht der Partial-PATCH sie', () => {
    expect(draftPayload(draft({ endDate: '', startTime: '', endTime: '' }))).toMatchObject({
      start_date: '2026-08-18', end_date: '', start_time: '', end_time: '',
    })
  })

  it('leert das Termin-Team, wenn «eigenes Team» aus ist', () => {
    expect(draftPayload(draft({ ownTeam: false, monteurIds: ['s-1'] })).monteur_ids).toEqual([])
    expect(draftPayload(draft({ ownTeam: true, monteurIds: ['s-1'] })).monteur_ids).toEqual(['s-1'])
  })

  it('schickt das Freitext-Label nur beim Typ «sonstiges»', () => {
    expect(draftPayload(draft({ kind: 'montage', label: 'Rest' })).label).toBe('')
    expect(draftPayload(draft({ kind: 'sonstiges', label: '  Besprechung ' })).label).toBe('Besprechung')
  })
})

describe('applyStartDate', () => {
  it('füllt ein leeres Enddatum mit dem Startdatum', () => {
    expect(applyStartDate(draft({ startDate: '', endDate: '' }), '2026-08-18'))
      .toEqual({ startDate: '2026-08-18', endDate: '2026-08-18' })
  })

  it('zieht ein eintägiges Enddatum mit, wenn der Start verschoben wird', () => {
    expect(applyStartDate(draft({ startDate: '2026-08-18', endDate: '2026-08-18' }), '2026-08-25'))
      .toEqual({ startDate: '2026-08-25', endDate: '2026-08-25' })
  })

  it('lässt einen echten Zeitraum stehen', () => {
    expect(applyStartDate(draft({ startDate: '2026-08-18', endDate: '2026-08-20' }), '2026-08-19'))
      .toEqual({ startDate: '2026-08-19' })
  })

  it('räumt das mitgezogene Enddatum wieder ab, wenn der Start geleert wird', () => {
    expect(applyStartDate(draft({ startDate: '2026-08-18', endDate: '2026-08-18' }), ''))
      .toEqual({ startDate: '', endDate: '' })
  })
})

describe('validateDrafts', () => {
  it('akzeptiert einen vollständigen Termin', () => {
    expect(validateDrafts([draft({ startTime: '07:30', endTime: '12:00' })])).toBeNull()
  })

  it('meldet ein fehlendes Startdatum mit Position', () => {
    expect(validateDrafts([draft(), draft({ startDate: '' })])).toBe('2. Termin: Startdatum fehlt.')
  })

  it('meldet ein Enddatum vor dem Startdatum', () => {
    expect(validateDrafts([draft({ endDate: '2026-08-17' })])).toMatch(/Enddatum/)
  })

  it('meldet eine Endzeit vor der Startzeit am selben Tag', () => {
    expect(validateDrafts([draft({ startTime: '12:00', endTime: '07:30' })])).toMatch(/Endzeit/)
  })

  it('erlaubt eine «rückwärts» wirkende Zeit über mehrere Tage', () => {
    expect(validateDrafts([
      draft({ endDate: '2026-08-20', startTime: '12:00', endTime: '07:30' }),
    ])).toBeNull()
  })
})

describe('diffAppointments', () => {
  const saved = [
    draft({ key: 'a-1', id: 'a-1', startDate: '2026-08-18' }),
    draft({ key: 'a-2', id: 'a-2', startDate: '2026-08-20' }),
  ]

  it('ist leer, solange nichts angefasst wurde', () => {
    const d = diffAppointments(saved, saved.map(x => ({ ...x })))
    expect(d).toEqual({ create: [], update: [], removeIds: [] })
  })

  it('erkennt Anlegen, Ändern und Löschen in einem Durchgang', () => {
    const current = [
      { ...saved[0], startTime: '07:30' },
      draft({ startDate: '2026-09-01' }),
    ]
    const d = diffAppointments(saved, current)
    expect(d.update.map(x => x.id)).toEqual(['a-1'])
    expect(d.create).toHaveLength(1)
    expect(d.removeIds).toEqual(['a-2'])
  })

  it('wertet eine bloss umsortierte Monteur-Auswahl nicht als Änderung', () => {
    const before = [draft({ key: 'a-1', id: 'a-1', ownTeam: true, monteurIds: ['s-1', 's-2'] })]
    const after = [draft({ key: 'a-1', id: 'a-1', ownTeam: true, monteurIds: ['s-2', 's-1'] })]
    expect(diffAppointments(before, after).update).toEqual([])
  })

  it('wertet ein abgewähltes «eigenes Team» als Änderung', () => {
    const before = [draft({ key: 'a-1', id: 'a-1', ownTeam: true, monteurIds: ['s-1'] })]
    const after = [{ ...before[0], ownTeam: false }]
    expect(diffAppointments(before, after).update.map(x => x.id)).toEqual(['a-1'])
  })
})

describe('normalizeDrafts', () => {
  it('macht die Reihenfolge im Formular für den Dirty-Vergleich irrelevant', () => {
    const a = draft({ key: 'a-1', id: 'a-1', startDate: '2026-08-18' })
    const b = draft({ key: 'a-2', id: 'a-2', startDate: '2026-08-20' })
    expect(normalizeDrafts([a, b])).toEqual(normalizeDrafts([b, a]))
  })
})

describe('sortDrafts', () => {
  it('sortiert chronologisch, ganztägige Termine nach getakteten desselben Tages', () => {
    const list = [
      draft({ key: 'c', startDate: '2026-08-20' }),
      draft({ key: 'b', startDate: '2026-08-18' }),
      draft({ key: 'a', startDate: '2026-08-18', startTime: '07:30' }),
      draft({ key: 'd', startDate: '' }),
    ]
    expect(sortDrafts(list).map(d => d.key)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('nextAppointment', () => {
  const list = [
    draft({ key: 'alt', startDate: '2026-08-01' }),
    draft({ key: 'laufend', startDate: '2026-08-10', endDate: '2026-08-20' }),
    draft({ key: 'kommend', startDate: '2026-09-01' }),
  ]

  it('nimmt den laufenden mehrtägigen Termin als nächsten', () => {
    expect(nextAppointment(list, '2026-08-14')?.key).toBe('laufend')
  })

  it('überspringt vergangene Termine', () => {
    expect(nextAppointment(list, '2026-08-25')?.key).toBe('kommend')
  })

  it('gibt null zurück, wenn nichts mehr ansteht', () => {
    expect(nextAppointment(list, '2026-12-01')).toBeNull()
  })

  it('ignoriert Termine ohne Datum', () => {
    expect(nextAppointment([draft({ startDate: '' })], '2026-08-14')).toBeNull()
  })
})

describe('Anzeige', () => {
  // Wochentags-Abkürzung je nach ICU-Daten mal mit, mal ohne Punkt ("Di"/"Di.") —
  // geprüft wird der Aufbau der Zeile, nicht die Locale-Schreibweise.
  it('zeigt Datum und Zeitfenster, mehrtägig mit Enddatum', () => {
    expect(fmtDraftWhen(draft({ startTime: '07:30', endTime: '12:00' })))
      .toMatch(/^Di\.?, 18\.08\.2026 · 07:30–12:00$/)
    expect(fmtDraftWhen(draft({ endDate: '2026-08-20' })))
      .toMatch(/^Di\.?, 18\.08\.2026 – Do\.?, 20\.08\.2026 · ganztägig$/)
  })

  it('nennt einen Termin ohne Datum beim Namen', () => {
    expect(fmtDraftWhen(draft({ startDate: '' }))).toBe('Kein Datum')
  })

  it('nutzt beim Typ «sonstiges» den Freitext als Überschrift', () => {
    expect(draftTitle(draft({ kind: 'sonstiges', label: 'Begehung' }))).toBe('Begehung')
    expect(draftTitle(draft({ kind: 'sonstiges', label: '' }))).toBe('Sonstiges')
    expect(draftTitle(draft({ kind: 'aufmass' }))).toBe('Aufmass')
  })

  it('fällt ohne Termin-Team auf das Projekt-Team zurück', () => {
    const staff = [{ id: 's-1', name: 'Marvin' }, { id: 's-2', name: 'Petra' }]
    expect(draftTeamNames(draft(), ['s-2'], staff)).toEqual({ names: 'Petra', fromProject: true })
    expect(draftTeamNames(draft({ ownTeam: true, monteurIds: ['s-1'] }), ['s-2'], staff))
      .toEqual({ names: 'Marvin', fromProject: false })
  })
})

describe('todayISO', () => {
  it('nimmt das LOKALE Datum — mit UTC gälte am Abend schon der Folgetag', () => {
    // 23:30 lokal: toISOString() läge in Zeitzonen östlich von UTC bereits im
    // nächsten Tag und würde den heutigen Termin aus «nächster Termin» kippen.
    const d = new Date(2026, 7, 14, 23, 30)
    expect(todayISO(d)).toBe('2026-08-14')
  })
})
