import { describe, expect, it } from 'vitest'
import type { WarrantyCase } from '../../../api/admin/warranty'
import {
  canCreateRepairProject, canReportWarranty, caseChanges, fmtTag, formAus, fristHinweis, fristKurz,
  repairProjectHint, transitionButtons,
} from './warrantyCases'

function fall(over: Partial<WarrantyCase> = {}): WarrantyCase {
  return {
    id: 'c-1', case_no: 217, source_project_id: 'p-1', repair_project_id: null,
    customer_id: null, reported_at: '2026-02-01', reported_via: null, reported_by_name: null,
    description: 'Store klemmt', deadline_at: '2026-03-14', expiry_at: '2029-03-14',
    status: 'gemeldet', decision: null, decided_at: null, decided_by_name: null,
    decision_note: null, cause: null, supplier_id: null, resolved_at: null, closed_at: null,
    created_by_name: null, created_at: '2026-02-01T08:00:00Z',
    allowed_transitions: ['in_pruefung', 'entschieden'], within_deadline: true,
    ...over,
  }
}

describe('fristHinweis', () => {
  const tag = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))

  it('der letzte Tag der Rügefrist zählt noch dazu', () => {
    const h = fristHinweis(tag('2026-03-14'), '2026-03-14', '2029-03-14')
    expect(h.ton).toBe('ok')
    expect(h.text).toBe('Rügefrist bis 14.03.2026 — die Meldung liegt innerhalb.')
  })

  it('auch mit Uhrzeit am letzten Tag noch innerhalb', () => {
    expect(fristHinweis(new Date(2026, 2, 14, 17, 30), '2026-03-14', null).ton).toBe('ok')
  })

  it('nach der Rügefrist: nur verdeckte Mängel', () => {
    const h = fristHinweis(tag('2026-03-15'), '2026-03-14', '2029-03-14')
    expect(h.ton).toBe('warn')
    expect(h.text).toContain('nur verdeckte Mängel bis 14.03.2029')
  })

  it('nach der Verjährung: abgelaufen', () => {
    expect(fristHinweis(tag('2029-03-15'), '2026-03-14', '2029-03-14').ton).toBe('bad')
  })

  it('ohne Stichtag: unbekannt statt einer erfundenen Frist', () => {
    expect(fristHinweis(tag('2026-03-15'), null, null)).toEqual({
      text: 'Frist unbekannt — am Projekt fehlt der Stichtag (Abnahme bzw. Rechnung).', ton: 'neutral',
    })
  })
})

describe('fmtTag', () => {
  it('liest das Datum ohne Zeitzonen-Verschiebung', () => {
    expect(fmtTag('2026-03-14')).toBe('14.03.2026')
    expect(fmtTag(null)).toBe('—')
  })
})

describe('fristKurz', () => {
  it('unterscheidet in Frist, nach Frist und unbekannt', () => {
    expect(fristKurz(fall())).toBe('in Frist')
    expect(fristKurz(fall({ within_deadline: false }))).toBe('nach Frist')
    expect(fristKurz(fall({ within_deadline: null, deadline_at: null }))).toBe('Frist unbekannt')
  })
})

describe('transitionButtons', () => {
  it('kein Knopf «entschieden» — dorthin führt der Entscheid selbst', () => {
    expect(transitionButtons(fall())).toEqual(['in_pruefung'])
    expect(transitionButtons(fall({ allowed_transitions: ['in_pruefung', 'in_arbeit', 'behoben', 'abgeschlossen'] })))
      .toEqual(['in_pruefung', 'in_arbeit', 'behoben', 'abgeschlossen'])
  })
})

describe('canReportWarranty', () => {
  it('nur zu abgeschlossenen (auch archivierten) Projekten', () => {
    expect(canReportWarranty('offen')).toBe(false)
    expect(canReportWarranty('abgeschlossen')).toBe(true)
    expect(canReportWarranty('archiviert')).toBe(true)
  })
})

describe('caseChanges', () => {
  it('unverändert: leerer Body', () => {
    const c = fall()
    expect(caseChanges(c, formAus(c))).toEqual({})
  })

  it('schickt nur Geändertes, leere Felder als null', () => {
    const c = fall({ cause: 'material', supplier_id: 's-1', decision_note: 'alt' })
    const body = caseChanges(c, { ...formAus(c), cause: '', supplier_id: '', decision_note: '  ' })
    expect(body).toEqual({ cause: null, supplier_id: null, decision_note: null })
  })

  it('ein Entscheid wird ersetzt, nie geleert; ein leerer Beschrieb nicht geschickt', () => {
    const c = fall({ decision: 'anerkannt', status: 'entschieden' })
    expect(caseChanges(c, { ...formAus(c), decision: '', description: '   ' })).toEqual({})
    expect(caseChanges(c, { ...formAus(c), decision: 'kulanz' })).toEqual({ decision: 'kulanz' })
  })
})

describe('canCreateRepairProject', () => {
  const entschieden = { allowed_transitions: ['in_pruefung', 'in_arbeit', 'behoben', 'abgeschlossen'] as WarrantyCase['allowed_transitions'] }
  it('erst mit Entscheid, nur einmal', () => {
    expect(canCreateRepairProject(fall({ ...entschieden, decision: 'anerkannt' }))).toBe(true)
    expect(canCreateRepairProject(fall({ ...entschieden, decision: null }))).toBe(false)
    expect(canCreateRepairProject(fall({ ...entschieden, decision: 'anerkannt', repair_project_id: 'r-1' }))).toBe(false)
    expect(canCreateRepairProject(fall({ decision: 'anerkannt', allowed_transitions: [] }))).toBe(false)
  })

  it('auch nach Ablehnung — dann als verrechenbare Reparatur', () => {
    expect(canCreateRepairProject(fall({ ...entschieden, decision: 'abgelehnt' }))).toBe(true)
    expect(repairProjectHint('abgelehnt')).toContain('verrechenbare')
    expect(repairProjectHint('kulanz')).toContain('Garantiefall')
  })
})
