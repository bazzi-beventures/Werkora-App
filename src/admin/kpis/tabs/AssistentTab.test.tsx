import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AssistentTab from './AssistentTab'
import type { KpiBriefing, KpiChatEvent } from '../../../api/admin/kpiAssistent'

// Reiter «Assistent» (docs/specs/kennzahlen-assistent.md §3.2): Analyse als
// erste Nachricht, Reiter-Knöpfe, Chat mit Werkzeug-Status und Links.

const api = vi.hoisted(() => ({
  listKpiBriefings: vi.fn(),
  getKpiBriefing: vi.fn(),
  createKpiBriefing: vi.fn(),
  askKpiAssistent: vi.fn(),
}))
vi.mock('../../../api/admin/kpiAssistent', () => api)

const KW45: KpiBriefing = {
  id: 'b-45', iso_year: 2026, iso_week: 45, status: 'fertig', created_at: '', finished_at: '',
  analysis: {
    gesamtbild: 'Der Oktober lief über Vorjahr.',
    veraenderungen: ['Zwei Rechnungen mehr überfällig.'],
    handlungsbedarf: [{
      titel: 'Überfällige Rechnungen', text: 'Mahnungen prüfen.',
      reiter: { id: 'rechnungen', label: 'Rechnungen' },
    }],
  },
  snapshot: {},
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0))
  for (const f of Object.values(api)) f.mockReset()
  api.listKpiBriefings.mockResolvedValue({
    briefings: [{ id: 'b-45', iso_year: 2026, iso_week: 45, status: 'fertig', created_at: '', finished_at: '' }],
    ki_hinweis: 'Erstellt von einer KI.',
  })
  api.getKpiBriefing.mockResolvedValue(KW45)
})

async function zeige(props: Partial<Parameters<typeof AssistentTab>[0]> = {}) {
  const onOpenReiter = vi.fn()
  await act(async () => { render(<AssistentTab onOpenReiter={onOpenReiter} {...props} />) })
  return onOpenReiter
}

describe('AssistentTab', () => {
  it('zeigt die jüngste Analyse mit Handlungsbedarf und Reiter-Knopf', async () => {
    const onOpenReiter = await zeige()
    expect(api.getKpiBriefing).toHaveBeenCalledWith('b-45')
    expect(screen.getByText('Der Oktober lief über Vorjahr.')).toBeTruthy()
    expect(screen.getByText('Zwei Rechnungen mehr überfällig.')).toBeTruthy()
    fireEvent.click(screen.getByText('Rechnungen →'))
    expect(onOpenReiter).toHaveBeenCalledWith({ id: 'rechnungen', label: 'Rechnungen' })
    // Die Woche ist fertig — kein «jetzt erstellen».
    expect(screen.queryByText('Wochenanalyse jetzt erstellen')).toBeNull()
  })

  it('öffnet aus der Push die verlinkte Woche statt der jüngsten', async () => {
    await zeige({ initialBriefingId: 'b-44' })
    expect(api.getKpiBriefing).toHaveBeenCalledWith('b-44')
  })

  it('bietet Erstellen an, wenn die laufende Woche fehlt', async () => {
    api.listKpiBriefings.mockResolvedValue({ briefings: [], ki_hinweis: '' })
    await zeige()
    expect(screen.getByText('Wochenanalyse jetzt erstellen')).toBeTruthy()
    expect(api.getKpiBriefing).not.toHaveBeenCalled()
  })

  it('streamt die Antwort, zeigt den Werkzeug-Status und die Reiter-Links', async () => {
    api.askKpiAssistent.mockImplementation(async function* (): AsyncGenerator<KpiChatEvent> {
      yield { type: 'tool', label: 'Lese Finanzen …' }
      yield { type: 'delta', text: 'Die Marge ' }
      yield { type: 'delta', text: 'lag bei 18 %.' }
      yield { type: 'links', links: [{ id: 'finanzen', label: 'Finanzen' }] }
      yield { type: 'done' }
    })
    const onOpenReiter = await zeige()
    const feld = screen.getByLabelText('Frage an den Kennzahlen-Assistenten')
    fireEvent.change(feld, { target: { value: 'Wie war die Marge?' } })
    await act(async () => { fireEvent.click(screen.getByText('Senden')) })
    expect(api.askKpiAssistent).toHaveBeenCalledWith('Wie war die Marge?', 'b-45', [])
    expect(screen.getByText('Wie war die Marge?')).toBeTruthy()
    expect(screen.getByText('Die Marge lag bei 18 %.')).toBeTruthy()
    fireEvent.click(screen.getByText('Finanzen →'))
    expect(onOpenReiter).toHaveBeenCalledWith({ id: 'finanzen', label: 'Finanzen' })
  })

  it('zeigt ein Diagramm über dem Text der Antwort und verlinkt dessen Reiter', async () => {
    api.askKpiAssistent.mockImplementation(async function* (): AsyncGenerator<KpiChatEvent> {
      yield { type: 'tool', label: 'Zeichne Diagramm …' }
      yield {
        type: 'chart', chart: {
          art: 'pipeline_stufen', form: 'balken', titel: 'Pipeline: noch nicht bezahlt',
          untertitel: 'CHF 113’724 in drei Stufen · ohne Zeitfilter', einheit: 'CHF',
          kategorien: ['Beim Kunden', 'Auftrag, nicht fakturiert', 'Fakturiert, offen'],
          reihen: [{ name: 'Betrag', rolle: 'haupt', werte: [40000, 12000, 61723.9] }],
          zusatz: ['4 Offerten', '1 Offerte', '24 Rechnungen'], hinweise: [],
          reiter: { id: 'pipeline', label: 'Projekt-Pipeline' },
        },
      }
      yield { type: 'delta', text: 'Am meisten liegt fakturiert, aber offen.' }
      yield { type: 'links', links: [{ id: 'pipeline', label: 'Projekt-Pipeline' }] }
      yield { type: 'done' }
    })
    const onOpenReiter = await zeige()
    await act(async () => { fireEvent.click(screen.getByText('Wie steht die Pipeline?')) })
    const titel = screen.getByText('Pipeline: noch nicht bezahlt')
    const text = screen.getByText('Am meisten liegt fakturiert, aber offen.')
    // Das Diagramm steht vor dem Text, in derselben (verbreiterten) Nachricht.
    const nachricht = titel.closest('.kpi-assistent-nachricht')!
    expect(nachricht.classList.contains('mit-diagramm')).toBe(true)
    expect(nachricht.contains(text)).toBe(true)
    expect(titel.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByText('Projekt-Pipeline →'))
    expect(onOpenReiter).toHaveBeenCalledWith({ id: 'pipeline', label: 'Projekt-Pipeline' })
  })

  it('zeigt einen Fehler des Assistenten an der Antwort', async () => {
    api.askKpiAssistent.mockImplementation(async function* (): AsyncGenerator<KpiChatEvent> {
      yield { type: 'error', message: 'Der Assistent ist gerade nicht erreichbar.' }
    })
    await zeige()
    await act(async () => { fireEvent.click(screen.getByText('Wie steht die Pipeline?')) })
    expect(screen.getByText('Der Assistent ist gerade nicht erreichbar.')).toBeTruthy()
  })
})
