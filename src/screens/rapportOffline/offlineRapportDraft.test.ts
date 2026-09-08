import { describe, it, expect, beforeEach } from 'vitest'
import {
  DRAFT_MAX_AGE_MS,
  clearOfflineDraft,
  draftBlockReason,
  fromDateInput,
  loadOfflineDraft,
  offlineDraftKey,
  saveOfflineDraft,
  toDateInput,
  todayDDMMYYYY,
  type OfflineRapportDraft,
} from './offlineRapportDraft'

// Zwischenstand des Offline-Formulars, docs/specs/offline-modus.md §4.5.3.

beforeEach(() => localStorage.clear())

function draft(over: Partial<OfflineRapportDraft> = {}): OfflineRapportDraft {
  return {
    date: '07.09.2026',
    staff: [{ name: 'Mario', hours: 8 }],
    description: 'Storen montiert.',
    workTypes: ['Neumontage'],
    einbauort: '',
    materials: [],
    kleinmaterial: null,
    isPartial: false,
    ...over,
  }
}

describe('Entwurf', () => {
  it('schreibt und liest zurück', () => {
    saveOfflineDraft('u-1', 'p-1', draft())
    expect(loadOfflineDraft('u-1', 'p-1')?.description).toBe('Storen montiert.')
  })

  it('trennt nach Mitarbeiter UND Projekt', () => {
    // Wer auf zwei Baustellen war, hat zwei Entwürfe — der zweite Rapport ist
    // nicht die Fortsetzung des ersten.
    saveOfflineDraft('u-1', 'p-1', draft({ description: 'Erste Baustelle' }))
    saveOfflineDraft('u-1', 'p-2', draft({ description: 'Zweite Baustelle' }))
    expect(loadOfflineDraft('u-1', 'p-1')?.description).toBe('Erste Baustelle')
    expect(loadOfflineDraft('u-1', 'p-2')?.description).toBe('Zweite Baustelle')
    // Und auf dem geteilten Tablet sieht der Kollege nichts.
    expect(loadOfflineDraft('u-2', 'p-1')).toBeNull()
  })

  it('fasst den Chat-Entwurf nicht an', () => {
    // Getrennte Schlüsselräume: ein angefangener Chat-Rapport darf durch das
    // Formular weder überschrieben noch fortgesetzt werden.
    localStorage.setItem('rapport-draft:u-1', '{"messages":[]}')
    saveOfflineDraft('u-1', 'p-1', draft())
    expect(localStorage.getItem('rapport-draft:u-1')).toBe('{"messages":[]}')
    expect(offlineDraftKey('u-1', 'p-1')).not.toContain('rapport-draft:')
  })

  it('verwirft einen abgelaufenen Entwurf', () => {
    const t0 = Date.parse('2026-09-07T08:00:00Z')
    saveOfflineDraft('u-1', 'p-1', draft(), t0)
    expect(loadOfflineDraft('u-1', 'p-1', t0 + DRAFT_MAX_AGE_MS - 1000)).not.toBeNull()
    expect(loadOfflineDraft('u-1', 'p-1', t0 + DRAFT_MAX_AGE_MS + 1000)).toBeNull()
    // Und räumt ihn dabei weg, statt ihn beim nächsten Mal erneut zu prüfen.
    expect(localStorage.getItem(offlineDraftKey('u-1', 'p-1'))).toBeNull()
  })

  it('überlebt kaputten Inhalt ohne zu werfen', () => {
    localStorage.setItem(offlineDraftKey('u-1', 'p-1'), 'kein json')
    expect(loadOfflineDraft('u-1', 'p-1')).toBeNull()
  })

  it('löscht auf Wunsch', () => {
    saveOfflineDraft('u-1', 'p-1', draft())
    clearOfflineDraft('u-1', 'p-1')
    expect(loadOfflineDraft('u-1', 'p-1')).toBeNull()
  })
})

describe('Datumsformate', () => {
  it('dreht zwischen Anzeige und Eingabefeld', () => {
    expect(toDateInput('07.09.2026')).toBe('2026-09-07')
    expect(fromDateInput('2026-09-07')).toBe('07.09.2026')
  })

  it('gibt bei Unsinn leer zurück, statt etwas zu erfinden', () => {
    expect(toDateInput('irgendwas')).toBe('')
    expect(fromDateInput('')).toBe('')
  })

  it('liefert heute im Format des Chat-Pfads', () => {
    expect(todayDDMMYYYY(new Date(2026, 8, 7))).toBe('07.09.2026')
    // Führende Nullen: der Server erwartet DD.MM.YYYY, nicht 7.9.2026.
    expect(todayDDMMYYYY(new Date(2026, 0, 3))).toBe('03.01.2026')
  })
})

describe('draftBlockReason', () => {
  it('lässt einen vollständigen Rapport durch', () => {
    expect(draftBlockReason(draft())).toBeNull()
  })

  it('verlangt Stunden', () => {
    // Ein Rapport ohne Stunden hätte nichts zu verrechnen und wäre beim Kunden
    // eine leere Seite.
    expect(draftBlockReason(draft({ staff: [{ name: 'Mario', hours: null }] }))).toMatch(/Stunden/)
    expect(draftBlockReason(draft({ staff: [{ name: '', hours: 8 }] }))).toMatch(/Stunden/)
    expect(draftBlockReason(draft({ staff: [] }))).toMatch(/Stunden/)
  })

  it('verlangt eine Beschreibung', () => {
    // Die WS-3-Meldung: «Nur die Stunden, aber nicht was ich gemacht habe.» Im
    // Chat fragt das LLM nach — hier muss es das Formular tun.
    expect(draftBlockReason(draft({ description: '   ' }))).toMatch(/gemacht/)
  })

  it('ignoriert eine leere Zusatzzeile, solange eine gefüllte da ist', () => {
    const d = draft({ staff: [{ name: 'Mario', hours: 8 }, { name: '', hours: null }] })
    expect(draftBlockReason(d)).toBeNull()
  })
})
