import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjectsScreen from './ProjectsScreen'
import { listProjects, listProjectLocalities } from '../../api/admin/projects'
import type { EmbeddedCustomer, Project } from '../../api/admin/projects'

// Spec: docs/specs/projektliste-filter-sortierung.md §3, §5, §6.
// Geprueft wird, was der Screen aus einer Bedienung macht: welche Parameter beim
// Endpoint ankommen, was die Chip-Zeile zeigt und was ein Maskenwechsel
// ueberlebt. Die Reihenfolge der Zeilen macht die Datenbank.

vi.mock('../../api/admin/projects', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/admin/projects')>()
  return {
    ...actual,
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listProjectLocalities: vi.fn(),
  }
})
vi.mock('../../api/admin/staff', () => ({
  getAdminStaff: vi.fn().mockResolvedValue([
    { id: 's-1', name: 'Marcin', projektleiter: true },
    { id: 's-2', name: 'Aline', projektleiter: true },
  ]),
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../api/modules', () => ({ isFeatureEnabled: (_me: unknown, key: string) => key === 'projektleiter_spalte' }))
vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const mockList = vi.mocked(listProjects)
const mockLocalities = vi.mocked(listProjectLocalities)

// Vollstaendig aufgebaut statt gecastet: der Screen liest quer durch die Zeile,
// und ein `as Project` ueber einem halben Objekt verschiebt den Fehler nur in die
// Laufzeit.
const KUNDE: EmbeddedCustomer = {
  id: 'c-1',
  name: 'Müller AG',
  billing_name: null,
  address: 'Hofstettweg 5, 8405 Winterthur',
  billing_address: null,
  object_address: null,
  email: null,
  phone: null,
}

const PROJEKT: Project = {
  id: 'p-1',
  project_id_text: '261301',
  name: 'Leerwhg. Tösstalstr. 134',
  kind: 'project',
  customer_id: 'c-1',
  customer: KUNDE,
  object_name: null,
  object_address: null,
  art_der_arbeit: null,
  projektleiter_id: null,
  monteur_ids: [],
  kontakte: [],
  eigentuemer: null,
  disposal_details: null,
  status: 'offen',
  is_closed: false,
  created_at: '2026-08-19T10:00:00Z',
  created_by: null,
  created_by_id: null,
  bemerkung: null,
  geruestfach: null,
  start_date: null,
  end_date: null,
  start_time: null,
  end_time: null,
  quote: null,
  invoice: null,
}

const EMPTY = {
  rows: [], total: 0, open_count: 536, closed_count: 1887, archived_count: 4, page: 1, page_size: 50,
}

beforeEach(() => {
  sessionStorage.clear()
  mockList.mockReset()
  mockList.mockResolvedValue(EMPTY)
  mockLocalities.mockReset()
  mockLocalities.mockResolvedValue([{ locality: 'Winterthur', count: 312 }])
})

function letzterAufruf() {
  return mockList.mock.calls[mockList.mock.calls.length - 1][0]
}

async function ersterLauf() {
  render(<ProjectsScreen />)
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  // Die Projektleiter-Spalte haengt an einem Feature-Flag, das erst nach getMe()
  // da ist. Wer vorher ein Popup oeffnet, verliert es beim Einfuegen der Spalte —
  // im Test wie im Browser (die ersten Millisekunden nach dem Mount).
  await screen.findByRole('button', { name: 'Filter: Projektleiter' })
}

async function filtern(spalte: string, wert: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: `Filter: ${spalte}` }))
  fireEvent.click(await screen.findByLabelText(wert))
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
  await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThan(1))
}

describe('ProjectsScreen — Spaltenfilter', () => {
  it('startet mit den offenen Projekten', async () => {
    await ersterLauf()
    expect(letzterAufruf()).toMatchObject({ lifecycle: ['offen'], page: 1 })
  })

  it('"keine Rechnung" beantwortet "fertig, aber nicht verrechnet"', async () => {
    await ersterLauf()
    await filtern('Rechnung', /Keine Rechnung/)
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Status' }))
    fireEvent.click(screen.getByLabelText('Abgeschlossen'))
    fireEvent.click(screen.getByLabelText('Offen'))
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({
      invoiceStatus: ['none'], lifecycle: ['abgeschlossen'],
    }))
  })

  it('filtert nach Projektleiter, inklusive "Nicht zugewiesen"', async () => {
    await ersterLauf()
    await filtern('Projektleiter', /Nicht zugewiesen/)
    expect(letzterAufruf()).toMatchObject({ projektleiterIds: ['none'] })
  })

  it('holt die Ortschaften erst, wenn der Kundenfilter geoeffnet wird', async () => {
    await ersterLauf()
    expect(mockLocalities).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Kunde' }))
    await waitFor(() => expect(mockLocalities).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('312')).toBeTruthy()
  })

  it('schickt Adresse und Telefon als "enthält"', async () => {
    await ersterLauf()
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Kunde' }))
    fireEvent.change(screen.getByLabelText('Telefon enthält'), { target: { value: '079 123 45 67' } })
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ phone: '079 123 45 67' }))
  })

  it('springt beim Filtern zurueck auf Seite 1', async () => {
    mockList.mockResolvedValue({ ...EMPTY, total: 500 })
    await ersterLauf()
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ page: 2 }))
    await filtern('Offerte', /Keine Offerte/)
    expect(letzterAufruf()).toMatchObject({ page: 1 })
  })

  it('die Kopfzeilen-Knoepfe schreiben in denselben Filter', async () => {
    // Zwei Bedienwege, ein Zustand (Spec §10.1 (b)) — sonst widersprechen sich
    // Knopf und Spaltenfilter.
    await ersterLauf()
    fireEvent.click(screen.getByRole('button', { name: 'Geschlossene anzeigen' }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ lifecycle: ['offen', 'abgeschlossen'] }))
    fireEvent.click(screen.getByRole('button', { name: /^Archiv/ }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ lifecycle: ['archiviert'] }))
  })
})

describe('ProjectsScreen — Chip-Zeile', () => {
  it('nennt den gesetzten Filter und laesst ihn einzeln entfernen', async () => {
    await ersterLauf()
    await filtern('Rechnung', /Gesendet/)
    const chip = await screen.findByText('Rechnung: Gesendet')
    expect(chip).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rechnung: Gesendet entfernen' }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ invoiceStatus: [] }))
  })

  it('nennt den Suchbegriff von Adresse und Telefon im Klartext', async () => {
    await ersterLauf()
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Kunde' }))
    fireEvent.change(screen.getByLabelText('Adresse enthält'), { target: { value: 'Musterstrasse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(await screen.findByText('Adresse enthält Musterstrasse')).toBeTruthy()
  })

  it('zeigt fuer den Normalzustand keinen Chip', async () => {
    // "Offen" ist die Vorgabe, kein gesetzter Filter — sonst stuende die Zeile
    // immer da und niemand liest sie mehr.
    await ersterLauf()
    expect(screen.queryByRole('button', { name: 'alle zurücksetzen' })).toBeNull()
  })

  it('"alle zurücksetzen" leert die Filter, die Suche bleibt stehen', async () => {
    await ersterLauf()
    fireEvent.change(screen.getByPlaceholderText(/suchen/), { target: { value: 'Meier' } })
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ search: 'Meier' }))
    await filtern('Offerte', /Keine Offerte/)
    fireEvent.click(screen.getByRole('button', { name: 'alle zurücksetzen' }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ search: 'Meier', quoteStatus: [] }))
    expect(screen.queryByRole('button', { name: 'alle zurücksetzen' })).toBeNull()
  })

  it('zeigt die Treffermenge neben den Gesamtzahlen', async () => {
    // Bei gesetztem Filter ist der Gesamtbestand die falsche Zahl an der
    // auffaelligsten Stelle (Spec §10.2).
    mockList.mockResolvedValue({ ...EMPTY, total: 42 })
    await ersterLauf()
    await filtern('Rechnung', /Gesendet/)
    expect(await screen.findByText('42 Treffer')).toBeTruthy()
  })
})

describe('ProjectsScreen — Persistenz', () => {
  it('Filter und Sortierung ueberleben einen Maskenwechsel', async () => {
    const erst = render(<ProjectsScreen />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    await screen.findByRole('button', { name: 'Filter: Projektleiter' })
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Rechnung' }))
    fireEvent.click(screen.getByLabelText('Bezahlt'))
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ invoiceStatus: ['bezahlt'] }))
    erst.unmount()

    mockList.mockClear()
    render(<ProjectsScreen />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(letzterAufruf()).toMatchObject({ invoiceStatus: ['bezahlt'] })
    expect(screen.getByText('Rechnung: Bezahlt')).toBeTruthy()
  })

  it('ein Filterwert, den es nicht mehr gibt, wird verworfen', async () => {
    // Sonst zeigt die Liste nach einem Katalogwechsel wortlos nichts an.
    sessionStorage.setItem('list-state:admin-projects', JSON.stringify({
      quoteStatus: ['gesendet', 'zombie'], beschaffung: ['gibt_es_nicht'], sortKey: 'lieblingsfarbe',
    }))
    await ersterLauf()
    expect(letzterAufruf()).toMatchObject({
      quoteStatus: ['gesendet'], beschaffung: [], sort: 'created_at',
    })
  })

  it('ein Filter auf einen geloeschten Projektleiter faellt weg', async () => {
    sessionStorage.setItem('list-state:admin-projects', JSON.stringify({
      projektleiterIds: ['s-1', 's-weg'],
    }))
    await ersterLauf()
    await waitFor(() => expect(letzterAufruf()).toMatchObject({ projektleiterIds: ['s-1'] }))
  })
})

describe('ProjectsScreen — Ortschaft in der Kundenzelle', () => {
  it('zeigt die Ortschaft als zweite Zeile', async () => {
    // Ein Filter, dessen Treffer man in der Zeile nicht nachvollziehen kann, ist
    // der schnellste Weg zu "die Liste zeigt Unsinn".
    mockList.mockResolvedValue({ ...EMPTY, rows: [PROJEKT], total: 1 })
    await ersterLauf()
    expect(await screen.findByText('Müller AG')).toBeTruthy()
    expect(screen.getByText('Winterthur')).toBeTruthy()
  })

  it('ohne erkennbare Ortschaft bleibt die Zelle einzeilig', async () => {
    mockList.mockResolvedValue({
      ...EMPTY,
      rows: [{ ...PROJEKT, customer: { ...KUNDE, address: 'Hofstettweg 5' } }],
      total: 1,
    })
    await ersterLauf()
    expect(await screen.findByText('Müller AG')).toBeTruthy()
    expect(screen.queryByText('Hofstettweg 5')).toBeNull()
  })
})
