import { describe, it, expect } from 'vitest'
import {
  advanceBaseline, autosavePatch, autosaveSignature, changedAutosaveFields, initialProjectForm,
  isProjectFormDirty, teamDirty,
} from './projectForm'
import type { ProjectFormValues } from './projectForm'
import type { Project } from '../../../api/admin/projects'
import { mergeAfterSync } from '../projectAppointments'
import type { AppointmentDraft } from '../projectAppointments'

// Die reinen Teile des Autosave (docs/specs/projektmaske-autosave.md §3.6):
// welche Felder sich geändert haben, was davon als PATCH rausgeht, und wie der
// Ausgangsstand danach nachrückt.

const PROJEKT = {
  id: 'p-1', name: 'Fassade Seehalde', customer_id: 'c-1', object_address: 'Seestrasse 1, 8001 Zürich',
  bemerkung: 'Schlüssel beim Hauswart', projektleiter_id: 's-1', monteur_ids: ['s-2', 's-3'],
  kontakte: [{ name: 'Beat Huber', kommentar: '', telefon: '079 123 45 67', email: '' }],
  art_der_arbeit: ['Neumontage'], wartung_interval_months: 12, wartung_last_at: '2026-01-15',
} as unknown as Project

function basis(): ProjectFormValues {
  return initialProjectForm(PROJEKT)
}

const CTX = { pickedAddress: null }

describe('changedAutosaveFields', () => {
  it('meldet nur das geänderte Feld', () => {
    const b = basis()
    expect(changedAutosaveFields(b, { ...b, bemerkung: 'Neu' })).toEqual(['bemerkung'])
  })

  it('zählt Team und Termine nicht — die werden ausdrücklich übernommen', () => {
    const b = basis()
    const c = { ...b, monteurIds: ['s-2'] }
    expect(changedAutosaveFields(b, c)).toEqual([])
    expect(teamDirty(b, c)).toBe(true)
  })

  it('eine leere neue Kontaktzeile ist keine Änderung', () => {
    const b = basis()
    const c = { ...b, kontakte: [...b.kontakte, { name: '', kommentar: '', telefon: '', email: '' }] }
    expect(changedAutosaveFields(b, c)).toEqual([])
    // Für die Knopf-Maske bleibt sie eine Änderung (Verlassen-Abfrage wie bisher);
    // die selbst speichernde Maske fragt deshalb nach den Autosave-Feldern.
    expect(isProjectFormDirty(b, c)).toBe(true)
    const getippt = { ...c, kontakte: [...b.kontakte, { name: 'Anna', kommentar: '', telefon: '', email: '' }] }
    expect(changedAutosaveFields(b, getippt)).toEqual(['kontakte'])
  })

  it('versteckte Rechnungsfelder ohne Häkchen zählen nicht', () => {
    const b = basis()
    expect(changedAutosaveFields(b, { ...b, billingName: 'Alt-Rest' })).toEqual([])
    expect(changedAutosaveFields(b, { ...b, billingDiffers: true })).toEqual(['billing'])
  })

  it('Art der Arbeit ohne Reihenfolge', () => {
    const b = { ...basis(), artDerArbeit: ['Neumontage', 'Demontage'] }
    expect(changedAutosaveFields(b, { ...b, artDerArbeit: ['Demontage', 'Neumontage'] })).toEqual([])
  })

  it('der Fingerabdruck ändert sich auch beim Zurücktippen auf den Ausgangswert', () => {
    const b = basis()
    const a = autosaveSignature({ ...b, bemerkung: 'x' })
    expect(a).not.toBe(autosaveSignature(b))
    expect(autosaveSignature({ ...b })).toBe(autosaveSignature(b))
  })
})

describe('autosavePatch', () => {
  it('schickt nur die Felder plus den Namen', () => {
    const b = basis()
    const c = { ...b, bemerkung: 'Neu' }
    expect(autosavePatch(['bemerkung'], c, b, CTX)).toEqual({ name: 'Fassade Seehalde', bemerkung: 'Neu' })
  })

  it('leert mit Leerwerten, nicht mit null — null filtert der PATCH weg', () => {
    const b = basis()
    const c = { ...b, bemerkung: '', projektleiterId: '', customerId: '', wartungInterval: '', wartungLastAt: '' }
    expect(autosavePatch(['bemerkung', 'projektleiterId', 'customerId', 'wartungInterval', 'wartungLastAt'], c, b, CTX))
      .toEqual({
        name: 'Fassade Seehalde',
        bemerkung: '', projektleiter_id: '', customer_id: '', wartung_interval_months: 0, wartung_last_at: '',
      })
  })

  it('ein leer getippter Name schickt den gespeicherten mit', () => {
    const b = basis()
    expect(autosavePatch(['bemerkung'], { ...b, name: '  ', bemerkung: 'x' }, b, CTX).name).toBe('Fassade Seehalde')
  })

  it('Rechnungs-Override: Häkchen weg = beide Felder leer', () => {
    const b = { ...basis(), billingDiffers: true, billingName: 'Verwaltung AG', billingAddress: 'Weg 1' }
    expect(autosavePatch(['billing'], { ...b, billingDiffers: false }, b, CTX))
      .toMatchObject({ billing_name: '', billing_address: '' })
  })

  it('Koordinaten nur, solange sie zur Adresse gehören', () => {
    const b = basis()
    const picked = { label: 'Neuweg 2, 8004 Zürich', lat: 47.37, lon: 8.52 }
    const c = { ...b, objectAddress: 'Neuweg 2, 8004 Zürich' }
    expect(autosavePatch(['objectAddress'], c, b, { pickedAddress: picked }))
      .toMatchObject({ object_address: 'Neuweg 2, 8004 Zürich', object_lat: 47.37, object_lon: 8.52 })
    const getippt = { ...b, objectAddress: 'Neuweg 2a, 8004 Zürich' }
    expect(autosavePatch(['objectAddress'], getippt, b, { pickedAddress: picked })).not.toHaveProperty('object_lat')
  })

  it('Kontakte ohne Leerzeilen', () => {
    const b = basis()
    const c = { ...b, kontakte: [...b.kontakte, { name: '', kommentar: '', telefon: '', email: '' }] }
    expect((autosavePatch(['kontakte'], c, b, CTX).kontakte as unknown[]).length).toBe(1)
  })
})

describe('advanceBaseline', () => {
  it('rückt nur die geschickten Felder nach', () => {
    const b = basis()
    const sent = { ...b, bemerkung: 'Neu', objectName: 'noch nicht geschickt' }
    const next = advanceBaseline(b, sent, ['bemerkung'])
    expect(next.bemerkung).toBe('Neu')
    expect(next.objectName).toBe(b.objectName)
  })

  it('billing nimmt alle drei Teile mit', () => {
    const b = basis()
    const sent = { ...b, billingDiffers: true, billingName: 'X', billingAddress: 'Y' }
    expect(advanceBaseline(b, sent, ['billing'])).toMatchObject({ billingDiffers: true, billingName: 'X', billingAddress: 'Y' })
  })
})

describe('mergeAfterSync', () => {
  const draft = (key: string, id: string | null, startDate: string): AppointmentDraft => ({
    key, id, startDate, endDate: '', startTime: '', endTime: '', kind: 'montage', label: '',
    ownTeam: false, monteurIds: [],
  })

  it('nimmt den Serverstand und behält, was im Formular noch offen ist', () => {
    const gespeichert = [draft('a', 'a', '2026-10-05'), draft('b', 'b', '2026-10-06')]
    const lokal = [
      draft('a', 'a', '2026-10-07'),        // eben gespeichert
      { ...gespeichert[1], startDate: '2026-10-09' }, // geändert, noch offen
      draft('neu-1', null, '2026-10-10'),   // neu, noch offen
    ]
    const server = [draft('a', 'a', '2026-10-07'), draft('b', 'b', '2026-10-06')]
    const out = mergeAfterSync(server, lokal, gespeichert, 'a')
    expect(out.map(d => [d.key, d.startDate])).toEqual([
      ['a', '2026-10-07'], ['b', '2026-10-09'], ['neu-1', '2026-10-10'],
    ])
  })

  it('ersetzt den eben angelegten Entwurf durch die Serverzeile', () => {
    const lokal = [draft('neu-1', null, '2026-10-10')]
    const server = [draft('x', 'x', '2026-10-10')]
    expect(mergeAfterSync(server, lokal, [], 'neu-1').map(d => d.key)).toEqual(['x'])
  })
})
