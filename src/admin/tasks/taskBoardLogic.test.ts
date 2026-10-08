import { describe, expect, it } from 'vitest'
import { BoardTask } from '../../api/admin'
import { cardAction, displayTitle, dropSortOrder, groupByAssignee, groupByColumn, groupByField, isOverdue, isProcessBound, matchesQuery, navTarget, taskField, urgency } from './taskBoardLogic'

function task(over: Partial<BoardTask>): BoardTask {
  return {
    id: 't1', source: 'auto', task_type: 'quote_followup', title: 'x',
    description: null, project_id: null, project_name: null, ref_kind: null,
    ref_id: null, status: 'offen', sort_order: 0, assignee_staff_id: null,
    assignee_locked: false, due_date: null, created_by_name: null,
    done_at: null, done_by_name: null, auto_done: false,
    created_at: '2026-08-01T10:00:00Z',
    ...over,
  }
}

const COLUMNS = ['offen', 'in_arbeit', 'wartet', 'erledigt'] as const

describe('groupByColumn', () => {
  it('sortiert innerhalb der Spalte nach sort_order, dann jüngste zuerst', () => {
    const tasks = [
      task({ id: 'a', sort_order: 2 }),
      task({ id: 'b', sort_order: 1 }),
      task({ id: 'c', sort_order: 1, created_at: '2026-08-05T10:00:00Z' }),
      task({ id: 'd', status: 'erledigt' }),
    ]
    const grouped = groupByColumn(tasks, [...COLUMNS])
    expect(grouped.offen.map(t => t.id)).toEqual(['c', 'b', 'a'])
    expect(grouped.erledigt.map(t => t.id)).toEqual(['d'])
    expect(grouped.in_arbeit).toEqual([])
  })
})

describe('dropSortOrder', () => {
  const col = [
    task({ id: 'a', sort_order: 10 }),
    task({ id: 'b', sort_order: 20 }),
    task({ id: 'c', sort_order: 30 }),
  ]

  it('leer → 0', () => {
    expect(dropSortOrder([], 0)).toBe(0)
  })

  it('oben/unten → Rand ±1, dazwischen → Mittel der Nachbarn', () => {
    expect(dropSortOrder(col, 0)).toBe(9)
    expect(dropSortOrder(col, 3)).toBe(31)
    expect(dropSortOrder(col, 1)).toBe(15)
  })

  it('ignoriert die bewegte Karte selbst (Umsortieren in derselben Spalte)', () => {
    // 'a' hinter 'b' ziehen: Nachbarn sind b(20) und c(30)
    expect(dropSortOrder(col, 1, 'a')).toBe(25)
  })
})

describe('isOverdue', () => {
  const today = new Date('2026-08-10T12:00:00Z')
  it('nur mit Fälligkeit in der Vergangenheit und nicht erledigt', () => {
    expect(isOverdue(task({ due_date: '2026-08-01' }), today)).toBe(true)
    expect(isOverdue(task({ due_date: '2026-08-11' }), today)).toBe(false)
    expect(isOverdue(task({ due_date: null }), today)).toBe(false)
    expect(isOverdue(task({ due_date: '2026-08-01', status: 'erledigt' }), today)).toBe(false)
  })
})

describe('taskField / groupByField', () => {
  const taskTypes = {
    quote_followup: { label: 'Offerte nachfassen', field: 'offerten', prozessgebunden: false },
    invoice_missing: { label: 'Rechnung erstellen', field: 'finanzen', prozessgebunden: true },
  }
  const fields = ['offerten', 'projekte', 'finanzen', 'pruefen', 'manuell']

  it('ordnet Auto-Karten ihrem Feld zu, manuelle und unbekannte Typen → manuell', () => {
    expect(taskField(task({}), taskTypes)).toBe('offerten')
    expect(taskField(task({ source: 'manuell' }), taskTypes)).toBe('manuell')
    expect(taskField(task({ task_type: 'unbekannt' }), taskTypes)).toBe('manuell')
  })

  it('blendet Erledigtes aus und sortiert nach Dringlichkeit', () => {
    const tasks = [
      task({ id: 'done', status: 'erledigt' }),
      task({ id: 'old', created_at: '2026-07-01T10:00:00Z' }),
      task({ id: 'due', due_date: '2099-01-01' }),
      task({ id: 'overdue', due_date: '2026-01-01' }),
    ]
    const grouped = groupByField(tasks, fields, taskTypes, new Date('2026-08-10T12:00:00Z'))
    expect(grouped.offerten.map(t => t.id)).toEqual(['overdue', 'due', 'old'])
    expect(grouped.finanzen).toEqual([])
  })
})

describe('isProcessBound', () => {
  const taskTypes = {
    quote_followup: { label: 'Offerte nachfassen', field: 'offerten', prozessgebunden: false },
    invoice_missing: { label: 'Rechnung erstellen', field: 'finanzen', prozessgebunden: true },
  }

  it('nur Auto-Karten prozessgebundener Typen; manuell und unbekannt → false', () => {
    expect(isProcessBound(task({ task_type: 'invoice_missing' }), taskTypes)).toBe(true)
    expect(isProcessBound(task({ task_type: 'quote_followup' }), taskTypes)).toBe(false)
    expect(isProcessBound(task({ source: 'manuell', task_type: null }), taskTypes)).toBe(false)
    // Verwaiste Alt-Karten müssen schliessbar bleiben (gleiche Kulanz wie das Backend)
    expect(isProcessBound(task({ task_type: 'gibt_es_nicht_mehr' }), taskTypes)).toBe(false)
  })
})

describe('groupByAssignee', () => {
  it('gruppiert nach Zuständigem, null = nicht zugewiesen, ohne Erledigte', () => {
    const tasks = [
      task({ id: 'a', assignee_staff_id: 's1' }),
      task({ id: 'b', assignee_staff_id: null }),
      task({ id: 'c', assignee_staff_id: 's1', status: 'erledigt' }),
    ]
    const grouped = groupByAssignee(tasks)
    expect(grouped.get('s1')!.map(t => t.id)).toEqual(['a'])
    expect(grouped.get(null)!.map(t => t.id)).toEqual(['b'])
  })
})

describe('navTarget', () => {
  it('Garantiefall: öffnet das Ursprungsprojekt auf dem Reiter «Garantie»', () => {
    expect(navTarget(task({ ref_kind: 'warranty_case', ref_id: 'c-1', project_id: 'p-1' })))
      .toEqual({ screen: 'projects', detailId: 'p-1', tab: 'warranty' })
  })

  it('Garantiefall ohne Projekt: kein Sprung ins Leere', () => {
    expect(navTarget(task({ ref_kind: 'warranty_case', ref_id: 'c-1' }))).toBeNull()
  })

  it('übrige Karten springen ohne Reiter', () => {
    expect(navTarget(task({ ref_kind: 'project', project_id: 'p-1' })))
      .toEqual({ screen: 'projects', detailId: 'p-1' })
  })

  it('Offerte, Rechnung, Freigabe mit Projekt: Projekt auf dem passenden Reiter', () => {
    expect(navTarget(task({ ref_kind: 'quote', ref_id: '12', project_id: 'p-1' })))
      .toEqual({ screen: 'projects', detailId: 'p-1', tab: 'quotes' })
    expect(navTarget(task({ ref_kind: 'invoice', ref_id: '7', project_id: 'p-1' })))
      .toEqual({ screen: 'projects', detailId: 'p-1', tab: 'invoices' })
    expect(navTarget(task({ ref_kind: 'approval', ref_id: 'a', project_id: 'p-1' })))
      .toEqual({ screen: 'projects', detailId: 'p-1', tab: 'approvals' })
  })

  it('freistehende Offerte: Liste, auf den Status der Aufgabe gefiltert', () => {
    expect(navTarget(task({ ref_kind: 'quote', task_type: 'quote_draft_stale' })))
      .toEqual({ screen: 'quotes', detailId: 'entwurf' })
    expect(navTarget(task({ ref_kind: 'quote', task_type: 'quote_followup' })))
      .toEqual({ screen: 'quotes', detailId: 'gesendet' })
    expect(navTarget(task({ ref_kind: 'invoice' }))).toEqual({ screen: 'invoices' })
  })
})

describe('cardAction', () => {
  it('«Projekt überfällig» → abschliessen, «Offerte nachfassen» → Erinnerungsmail', () => {
    expect(cardAction(task({ task_type: 'project_overdue', project_id: 'p-1' }))?.kind).toBe('close_project')
    expect(cardAction(task({ task_type: 'quote_followup', ref_id: '42' }))?.kind).toBe('quote_reminder')
  })

  it('keine Aktion für erledigte, manuelle, übrige Typen oder kaputte Bezüge', () => {
    expect(cardAction(task({ task_type: 'project_overdue', project_id: 'p-1', status: 'erledigt' }))).toBeNull()
    expect(cardAction(task({ source: 'manuell', task_type: null, project_id: 'p-1' }))).toBeNull()
    expect(cardAction(task({ task_type: 'invoice_overdue_action', ref_id: '7' }))).toBeNull()
    expect(cardAction(task({ task_type: 'project_overdue', project_id: null }))).toBeNull()
    expect(cardAction(task({ task_type: 'quote_followup', ref_id: 'abc' }))).toBeNull()
  })
})

describe('displayTitle', () => {
  it('lässt das Typ-Präfix weg, das der Chip schon nennt', () => {
    expect(displayTitle('Projekt überfällig: Torti Seuzach', 'Projekt überfällig')).toBe('Torti Seuzach')
    expect(displayTitle('Offerte fertigstellen: OFF-2026-070', 'Offerte fertigstellen')).toBe('OFF-2026-070')
  })

  it('lässt fremde, leere und präfixlose Titel stehen', () => {
    expect(displayTitle('Garantiefall G-4 prüfen: Huber', 'Garantiefall prüfen')).toBe('Garantiefall G-4 prüfen: Huber')
    expect(displayTitle('Projekt überfällig:', 'Projekt überfällig')).toBe('Projekt überfällig:')
    expect(displayTitle('Kunde anrufen', null)).toBe('Kunde anrufen')
  })
})

describe('matchesQuery', () => {
  const t = task({ title: 'Rechnung erstellen: Huber Neftenbach', project_name: '261110 Suhner', description: null })

  it('trifft jedes Wort in Titel, Projekt oder Typ — ohne Gross-/Kleinschreibung', () => {
    expect(matchesQuery(t, '')).toBe(true)
    expect(matchesQuery(t, 'huber')).toBe(true)
    expect(matchesQuery(t, 'neftenbach 261110')).toBe(true)
    expect(matchesQuery(t, 'mahnen', 'Rechnung mahnen')).toBe(true)
  })

  it('verlangt alle Wörter', () => {
    expect(matchesQuery(t, 'huber seuzach')).toBe(false)
  })
})

describe('urgency', () => {
  const today = new Date(2026, 9, 8, 10, 0)

  it('stuft nach Fälligkeit ab', () => {
    expect(urgency(task({ due_date: '2026-10-07' }), today)).toBe('overdue')
    expect(urgency(task({ due_date: '2026-10-08' }), today)).toBe('today')
    expect(urgency(task({ due_date: '2026-10-11' }), today)).toBe('soon')
    expect(urgency(task({ due_date: '2026-10-12' }), today)).toBeNull()
    expect(urgency(task({ due_date: null }), today)).toBeNull()
  })

  it('Erledigtes ist nie dringend', () => {
    expect(urgency(task({ due_date: '2026-10-01', status: 'erledigt' }), today)).toBeNull()
  })

  it('rechnet in lokalen Kalendertagen, nicht in UTC', () => {
    // 00:30 Ortszeit am 8.10. ist in UTC noch der 7.10. — fällig am 7.10. ist trotzdem überfällig.
    const shortlyAfterMidnight = new Date(2026, 9, 8, 0, 30)
    expect(isOverdue(task({ due_date: '2026-10-07' }), shortlyAfterMidnight)).toBe(true)
  })
})
