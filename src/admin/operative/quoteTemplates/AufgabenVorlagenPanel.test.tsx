import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AufgabenVorlagenPanel } from './AufgabenVorlagenPanel'
import {
  createProjectTaskTemplate, deleteProjectTaskTemplate, listProjectTaskTemplates,
  updateProjectTaskTemplate,
} from '../../../api/admin/projectTaskTemplates'

// Nur das Netzwerk mocken — Formular- und Listenlogik bleiben echt.
vi.mock('../../../api/admin/projectTaskTemplates', () => ({
  listProjectTaskTemplates: vi.fn(),
  createProjectTaskTemplate: vi.fn(),
  updateProjectTaskTemplate: vi.fn(),
  deleteProjectTaskTemplate: vi.fn(),
}))

const mockList = vi.mocked(listProjectTaskTemplates)
const mockCreate = vi.mocked(createProjectTaskTemplate)
const mockUpdate = vi.mocked(updateProjectTaskTemplate)
const mockDelete = vi.mocked(deleteProjectTaskTemplate)

const AKTIV = {
  id: 't1', text: 'Schlüssel beim Hauswart abholen', sort_order: 1,
  is_active: true, created_at: '2026-08-18T08:00:00Z', updated_at: null,
}
const PAUSIERT = {
  id: 't2', text: 'Winterdienst prüfen', sort_order: 2,
  is_active: false, created_at: '2026-08-18T08:00:00Z', updated_at: null,
}

describe('AufgabenVorlagenPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([AKTIV, PAUSIERT])
    mockCreate.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
  })

  it('zeigt aktive und pausierte Vorlagen mit Zähler der aktiven', async () => {
    render(<AufgabenVorlagenPanel />)
    expect(await screen.findByText('Schlüssel beim Hauswart abholen')).toBeInTheDocument()
    expect(screen.getByText('Winterdienst prüfen')).toBeInTheDocument()
    // Nur die aktive Vorlage kommt auf neue Projekte.
    expect(screen.getByText('1 Aufgabe kommt auf jedes neue Projekt.')).toBeInTheDocument()
  })

  it('legt eine neue Standard-Aufgabe an und lädt neu', async () => {
    render(<AufgabenVorlagenPanel />)
    await screen.findByText('Schlüssel beim Hauswart abholen')

    fireEvent.change(screen.getByPlaceholderText(/Neue Standard-Aufgabe/), {
      target: { value: '  Baustelle besenrein übergeben  ' },
    })
    fireEvent.click(screen.getByText('+ Aufgabe'))

    // Der Panel trimmt vor dem Senden — sonst landet Whitespace in der Checkliste.
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('Baustelle besenrein übergeben'))
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  })

  it('pausiert eine aktive Vorlage', async () => {
    render(<AufgabenVorlagenPanel />)
    await screen.findByText('Schlüssel beim Hauswart abholen')

    fireEvent.click(screen.getByText('Pausieren'))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', { is_active: false }))
  })

  it('löscht erst nach Bestätigung', async () => {
    render(<AufgabenVorlagenPanel />)
    await screen.findByText('Schlüssel beim Hauswart abholen')

    fireEvent.click(screen.getAllByText('Löschen')[0])
    expect(mockDelete).not.toHaveBeenCalled()

    // Der Bestätigungsdialog trägt denselben Knopf-Text — der zweite Treffer ist seiner.
    const confirmButtons = screen.getAllByText('Löschen')
    fireEvent.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('t1'))
  })

  it('meldet leere Liste statt einer leeren Tabelle', async () => {
    mockList.mockResolvedValue([])
    render(<AufgabenVorlagenPanel />)
    expect(await screen.findByText(/Noch keine Standard-Aufgaben/)).toBeInTheDocument()
  })
})
