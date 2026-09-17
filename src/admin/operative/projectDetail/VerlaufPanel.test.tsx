import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerlaufPanel, nachTagen, tagesTitel } from './VerlaufPanel'
import type { ProjectHistory, ProjectHistoryEvent } from '../../../api/admin/projects'

function ereignis(over: Partial<ProjectHistoryEvent> = {}): ProjectHistoryEvent {
  return {
    at: '2026-09-12T13:42:11Z',
    gruppe: 'offerte',
    text: 'Offerte 2601249 versendet an mueller@example.ch',
    akteur: 'Luca Bazzi',
    quelle: 'audit',
    ...over,
  }
}

function renderPanel(history: ProjectHistory | null, over: Partial<{ loading: boolean; failed: boolean }> = {}) {
  render(<VerlaufPanel history={history} loading={false} failed={false} {...over} />)
}

describe('VerlaufPanel', () => {
  it('zeigt Uhrzeit, Akteur und Satz', () => {
    renderPanel({ events: [ereignis()], truncated: false })
    expect(screen.getByText('Luca Bazzi')).toBeTruthy()
    expect(screen.getByText(/Offerte 2601249 versendet/)).toBeTruthy()
  })

  it('schreibt «System», wo eine Automatik gehandelt hat', () => {
    // Niemand soll einem Scheduler eine Handlung zuschreiben.
    renderPanel({ events: [ereignis({ akteur: null, quelle: 'system' })], truncated: false })
    expect(screen.getByText('System')).toBeTruthy()
  })

  it('schreibt «—», wo die Quelle keine Person kennt', () => {
    renderPanel({ events: [ereignis({ akteur: null, quelle: 'tabelle' })], truncated: false })
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('sagt an, wenn ältere Ereignisse fehlen', () => {
    renderPanel({ events: [ereignis()], truncated: true })
    expect(screen.getByText(/Ältere Ereignisse sind nicht geladen/)).toBeTruthy()
  })

  it('unterscheidet leer von nicht geladen', () => {
    renderPanel({ events: [], truncated: false })
    expect(screen.getByText(/noch nichts aufgezeichnet/)).toBeTruthy()

    render(<VerlaufPanel history={null} loading={false} failed={true} />)
    expect(screen.getByText(/konnte nicht geladen werden/)).toBeTruthy()
  })

  it('filtert nach Gruppe', async () => {
    renderPanel({
      events: [
        ereignis({ gruppe: 'offerte', text: 'Offerte 2601249 versendet' }),
        ereignis({ gruppe: 'rapport', text: 'Rapport vom 03.09.2026 erfasst' }),
      ],
      truncated: false,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Rapporte' }))
    expect(screen.queryByText(/Offerte 2601249/)).toBeNull()
    expect(screen.getByText(/Rapport vom 03.09.2026/)).toBeTruthy()
  })

  it('zeigt keine Filter, solange es nur eine Gruppe gibt', () => {
    renderPanel({ events: [ereignis()], truncated: false })
    expect(screen.queryByRole('button', { name: 'Alle' })).toBeNull()
  })
})

describe('Tagesgruppierung', () => {
  const heute = new Date('2026-09-17T09:00:00')

  it('benennt Heute und Gestern', () => {
    expect(tagesTitel('2026-09-17T08:00:00', heute)).toBe('Heute')
    expect(tagesTitel('2026-09-16T23:00:00', heute)).toBe('Gestern')
    expect(tagesTitel('2026-09-12T13:00:00', heute)).toBe('12.09.2026')
  })

  it('fasst aufeinanderfolgende Ereignisse desselben Tages zusammen', () => {
    const bloecke = nachTagen([
      ereignis({ at: '2026-09-17T10:00:00' }),
      ereignis({ at: '2026-09-17T08:00:00' }),
      ereignis({ at: '2026-09-12T13:00:00' }),
    ], heute)
    expect(bloecke.map(b => b.titel)).toEqual(['Heute', '12.09.2026'])
    expect(bloecke[0].events).toHaveLength(2)
  })
})
