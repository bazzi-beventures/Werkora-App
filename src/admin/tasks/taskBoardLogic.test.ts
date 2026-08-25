import { describe, expect, it } from 'vitest'
import { BoardTask } from '../../api/admin'
import { dropSortOrder, groupByAssignee, groupByColumn, groupByField, isOverdue, isProcessBound, taskField } from './taskBoardLogic'

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
