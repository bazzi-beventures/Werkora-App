import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjektEntwurfScreen from './ProjektEntwurfScreen'
import { createProjectDraft } from '../api/projectDrafts'

vi.mock('../api/projectDrafts', () => ({ createProjectDraft: vi.fn() }))
// Beide machen eigene Netzwerk-Calls; für den Payload irrelevant.
vi.mock('../shared/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value }: { value: string }) => <input readOnly value={value} />,
}))
vi.mock('../shared/CompanySearch', () => ({ CompanySearch: () => null }))

const mockCreate = vi.mocked(createProjectDraft)

function fill() {
  render(<ProjektEntwurfScreen onNavHome={() => {}} onLoggedOut={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('z. B. Garagentor reparieren'), {
    target: { value: 'Storen ersetzen' },
  })
  fireEvent.change(screen.getByPlaceholderText('Vor- und Nachname oder Firma'), {
    target: { value: 'Baumgartner Rolf' },
  })
}

async function submit() {
  fireEvent.click(screen.getByText('Entwurf an Büro senden'))
  await waitFor(() => expect(mockCreate).toHaveBeenCalled())
  return mockCreate.mock.calls[0][0]
}

describe('ProjektEntwurfScreen — Art der Arbeit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockCreate.mockResolvedValue({} as never)
  })

  it('schickt die angekreuzten Leistungsarten in kanonischer Reihenfolge mit', async () => {
    fill()
    fireEvent.click(screen.getByText('Service / Wartung'))
    fireEvent.click(screen.getByText('Neumontage'))

    expect((await submit()).art_der_arbeit).toEqual(['Neumontage', 'Wartung'])
  })

  it('schickt eine leere Liste, wenn nichts angekreuzt ist', async () => {
    fill()
    expect((await submit()).art_der_arbeit).toEqual([])
  })

  it('lässt eine Auswahl wieder abwählen', async () => {
    fill()
    fireEvent.click(screen.getByText('Reparatur'))
    fireEvent.click(screen.getByText('Reparatur'))

    expect((await submit()).art_der_arbeit).toEqual([])
  })
})
