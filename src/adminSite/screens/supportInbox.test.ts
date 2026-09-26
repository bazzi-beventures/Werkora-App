/**
 * Regeln des Support-Posteingangs — docs/specs/support-uebersicht.md §3.
 */
import { describe, it, expect } from 'vitest'
import type { SupportTicket } from '../../api/support'
import {
  ageLabel, ageTone, inboxView, isUnread, routeLabel, routeLabelAny, tabCounts,
} from './supportInbox'

const NOW = new Date('2026-09-25T12:00:00Z').getTime()

function tk(over: Partial<SupportTicket>): SupportTicket {
  return {
    id: 'x', ticket_no: 1, reference: 'WS-1', tenant_id: 't-1', message: 'Text',
    status: 'offen', created_at: '2026-09-25T10:00:00Z',
    snapshot_error_count: 0, attachment_count: 0,
    ...over,
  }
}

describe('inboxView', () => {
  const rows = [
    tk({ id: 'neu', created_at: '2026-09-25T11:00:00Z' }),
    tk({ id: 'alt', created_at: '2026-09-20T11:00:00Z', status: 'in_arbeit' }),
    tk({ id: 'fertig', created_at: '2026-09-24T11:00:00Z', status: 'erledigt' }),
  ]

  it('«Zu erledigen» zeigt offen + in Arbeit, die älteste zuerst', () => {
    const ids = inboxView(rows, { tab: 'todo', tenantId: '', query: '' }).map(t => t.id)
    expect(ids).toEqual(['alt', 'neu'])
  })

  it('«Alle» zeigt die neueste zuerst', () => {
    const ids = inboxView(rows, { tab: 'alle', tenantId: '', query: '' }).map(t => t.id)
    expect(ids).toEqual(['neu', 'fertig', 'alt'])
  })

  it('sucht in Referenz, Text und Melder', () => {
    const r = [tk({ id: 'a', created_by_name: 'Mia Keller' }), tk({ id: 'b', reference: 'WS-77' })]
    expect(inboxView(r, { tab: 'alle', tenantId: '', query: 'keller' }).map(t => t.id)).toEqual(['a'])
    expect(inboxView(r, { tab: 'alle', tenantId: '', query: 'ws-77' }).map(t => t.id)).toEqual(['b'])
  })

  it('filtert auf eine Häufung', () => {
    const r = [tk({ id: 'a', route: 'rapport' }), tk({ id: 'b', route: 'projekte' })]
    const out = inboxView(r, {
      tab: 'todo', tenantId: '', query: '', cluster: { kind: 'route', key: 'rapport' },
    })
    expect(out.map(t => t.id)).toEqual(['a'])
  })

  it('zählt die Reiter im gewählten Mandanten', () => {
    const r = [...rows, tk({ id: 'fremd', tenant_id: 't-2' })]
    expect(tabCounts(r, 't-1')).toEqual({ todo: 2, erledigt: 1, alle: 3 })
    expect(tabCounts(r, '').todo).toBe(3)
  })
})

describe('Alter', () => {
  it('kurz und lesbar', () => {
    expect(ageLabel('2026-09-25T11:20:00Z', NOW)).toBe('40 min')
    expect(ageLabel('2026-09-25T07:00:00Z', NOW)).toBe('5 h')
    expect(ageLabel('2026-09-22T12:00:00Z', NOW)).toBe('3 T')
  })

  it('färbt ab 24 h bzw. 72 h ein — erledigte nie', () => {
    expect(ageTone(tk({ created_at: '2026-09-25T00:00:00Z' }), NOW)).toBe('ok')
    expect(ageTone(tk({ created_at: '2026-09-24T12:00:00Z' }), NOW)).toBe('warn')
    expect(ageTone(tk({ created_at: '2026-09-22T12:00:00Z' }), NOW)).toBe('late')
    expect(ageTone(tk({ created_at: '2026-09-01T12:00:00Z', status: 'erledigt' }), NOW)).toBe('ok')
  })
})

describe('ungelesen', () => {
  it('nur bei ausdrücklich leerem seen_at — ein alter Server ohne Spalte markiert nichts', () => {
    expect(isUnread({ seen_at: null })).toBe(true)
    expect(isUnread({ seen_at: '2026-09-25T10:00:00Z' })).toBe(false)
    expect(isUnread({})).toBe(false)
  })
})

describe('Screen-Namen', () => {
  it('übersetzt nach Bereich', () => {
    expect(routeLabel('rapport', 'pwa')).toBe('Rapport erfassen')
    expect(routeLabel('projects', 'admin')).toBe('Projekte')
    expect(routeLabel('dashboard', 'admin')).toBe('Dashboard')
  })

  it('lässt Unbekanntes roh stehen, statt zu raten', () => {
    expect(routeLabel('irgendwas', 'admin')).toBe('irgendwas')
    expect(routeLabelAny('/neu')).toBe('/neu')
  })
})
