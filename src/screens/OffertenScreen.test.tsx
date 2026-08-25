import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OffertenScreen from './OffertenScreen'
import { apiFetch } from '../api/client'

// Die Liste gruppierte schon vorher nach Projekt — falsch war die Gewichtung:
// der Projektname hing an .projekte-group-date (12 px, uppercase, nowrap — eine
// Klasse für DATUMS-Köpfe), die Offertennummer stand mit 15 px/700 als Titel der
// Karte. Der Monteur sucht aber den Auftrag, an dem er heute steht.

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

const mockFetch = vi.mocked(apiFetch)

function quote(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    quote_number: 'OF-2026-91',
    project_id: 'p1',
    project_name: 'Sanierung Storen Müller, Musterstrasse 12',
    status: 'gesendet',
    total_amount: 4200,
    quote_date: '2026-08-14',
    valid_until: '2026-09-13',
    created_at: '2026-08-14T10:00:00Z',
    pdf_url: null,
    storage_path: 'x/y.pdf',
    ...over,
  }
}

const noop = () => {}

function renderScreen() {
  return render(
    <OffertenScreen
      onNavHome={noop} onNavArbeitszeit={noop} onNavProjekte={noop}
      onNavProfile={noop} onLoggedOut={noop}
    />,
  )
}

beforeEach(() => mockFetch.mockReset())

describe('OffertenScreen', () => {
  it('führt den Projektnamen als Titel, die Offertennummer klein darunter', async () => {
    mockFetch.mockResolvedValue([quote()])
    const { container } = renderScreen()

    const title = await screen.findByText('Sanierung Storen Müller, Musterstrasse 12')
    expect(title).toHaveClass('offerten-group-title')

    const number = screen.getByText('OF-2026-91')
    expect(number).toHaveClass('offerten-quote-number')

    // Reihenfolge im DOM ist die Hierarchie: erst der Auftrag, dann die Nummer.
    expect(title.compareDocumentPosition(number) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
    // Die Datums-Klasse aus «Meine Projekte» taucht hier nicht mehr auf.
    expect(container.querySelector('.projekte-group-date')).toBeNull()
  })

  it('bündelt mehrere Offerten eines Projekts unter einem Kopf mit Anzahl', async () => {
    mockFetch.mockResolvedValue([
      quote({ id: 1, quote_number: 'OF-2026-91' }),
      quote({ id: 2, quote_number: 'OF-2026-90', status: 'abgelehnt' }),
    ])
    const { container } = renderScreen()

    await screen.findByText('2 Offerten')
    expect(container.querySelectorAll('.offerten-group-title')).toHaveLength(1)
    expect(container.querySelectorAll('.offerten-quote-number')).toHaveLength(2)
  })

  it('zwei Projekte ergeben zwei Gruppen in Backend-Reihenfolge', async () => {
    mockFetch.mockResolvedValue([
      quote({ id: 1, project_id: 'p2', project_name: 'Rollladen Meier, Chur' }),
      quote({ id: 2, quote_number: 'OF-2026-90' }),
    ])
    const { container } = renderScreen()

    await screen.findByText('Rollladen Meier, Chur')
    const titles = [...container.querySelectorAll('.offerten-group-title')]
      .map(el => el.textContent)
    expect(titles).toEqual(['Rollladen Meier, Chur', 'Sanierung Storen Müller, Musterstrasse 12'])
  })

  it('Offerte ohne Projekt bekommt eine benannte Gruppe statt eines Gedankenstrichs', async () => {
    mockFetch.mockResolvedValue([quote({ project_id: null, project_name: '' })])
    renderScreen()

    const title = await screen.findByText('Ohne Projekt')
    expect(title).toHaveClass('offerten-group-title-empty')
  })
})
