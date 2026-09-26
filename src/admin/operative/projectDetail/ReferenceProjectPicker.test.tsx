import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ReferenceProjectPicker } from './ReferenceProjectPicker'
import type { Project } from '../../../api/admin/projects'

// Das Feld «Bezieht sich auf Projekt» (Spec docs/specs/garantiefall.md §3.9).
//
// Der wichtigste Test hier ist der letzte: «Entfernen» muss `null` melden, und
// der Aufrufer muss daraus ein mitgeschicktes `parent_project_id: null` machen.
// In der ersten Fassung räumte der Knopf nur die Maske auf — die Zeile in der
// Datenbank behielt ihren Verweis, und beim nächsten Öffnen stand er wieder da.

vi.mock('../../../api/admin/projects', () => ({
  listProjects: vi.fn(),
}))

const { listProjects } = await import('../../../api/admin/projects')
const listProjectsMock = vi.mocked(listProjects)

function projekt(over: Partial<Project> = {}): Project {
  return {
    id: 'p-1', project_id_text: '2024-018', name: 'Storen Meier',
    kind: 'project', customer: { name: 'Meier AG' },
    object_address: 'Dorfstrasse 3, 7000 Chur',
    ...over,
  } as unknown as Project
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Suche', () => {
  it('fragt erst ab zwei Zeichen und zeigt Nummer, Kunde und Adresse', async () => {
    listProjectsMock.mockResolvedValue({ rows: [projekt()] } as never)
    render(<ReferenceProjectPicker value="" label="" onPick={vi.fn()} />)

    const feld = screen.getByLabelText(/Bezieht sich auf Projekt/i)
    fireEvent.change(feld, { target: { value: 'S' } })
    expect(listProjectsMock).not.toHaveBeenCalled()

    fireEvent.change(feld, { target: { value: 'Storen' } })
    await waitFor(() => expect(listProjectsMock).toHaveBeenCalledOnce())
    expect(await screen.findByText(/2024-018 — Storen Meier/)).toBeTruthy()
    expect(screen.getByText(/Meier AG · Dorfstrasse 3/)).toBeTruthy()
  })

  it('blendet interne Einsaetze aus — eine Teamsitzung ist keine Nacharbeit', async () => {
    listProjectsMock.mockResolvedValue({
      rows: [projekt(), projekt({ id: 'p-2', name: 'Teamsitzung', kind: 'teamsitzung' })],
    } as never)
    render(<ReferenceProjectPicker value="" label="" onPick={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Bezieht sich auf Projekt/i),
      { target: { value: 'Storen' } })

    expect(await screen.findByText(/Storen Meier/)).toBeTruthy()
    expect(screen.queryByText(/Teamsitzung/)).toBeNull()
  })

  it('meldet das gewaehlte Projekt vollstaendig zurueck', async () => {
    const onPick = vi.fn()
    listProjectsMock.mockResolvedValue({ rows: [projekt()] } as never)
    render(<ReferenceProjectPicker value="" label="" onPick={onPick} />)

    fireEvent.change(screen.getByLabelText(/Bezieht sich auf Projekt/i),
      { target: { value: 'Storen' } })
    fireEvent.click(await screen.findByText(/2024-018 — Storen Meier/))

    // Die ganze Zeile, nicht nur die id: die Feldübernahme im Formular liest
    // Kunde, Objekt und Kontakte daraus, ohne ein zweites Mal zu fragen.
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }))
  })
})

describe('Gesetzter Verweis', () => {
  it('zeigt den Namen statt des Suchfelds', () => {
    render(<ReferenceProjectPicker value="p-1" label="2024-018 — Storen Meier" onPick={vi.fn()} />)

    expect(screen.getByText('2024-018 — Storen Meier')).toBeTruthy()
    expect(screen.queryByLabelText(/Bezieht sich auf Projekt/i)).toBeNull()
  })

  it('«Entfernen» meldet null — sonst bliebe der Verweis in der Datenbank stehen', () => {
    const onPick = vi.fn()
    render(<ReferenceProjectPicker value="p-1" label="Storen Meier" onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: /Referenzprojekt entfernen/i }))

    expect(onPick).toHaveBeenCalledWith(null)
  })
})
