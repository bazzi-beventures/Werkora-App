import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ProjectDetailHeader } from './ProjectDetailHeader'
import type { Project, RepairCaseRef, RepairProjectRef, WarrantyInfo } from '../../../api/admin/projects'

// Der Garantie-Vermerk und die Rueckverweise im Projektkopf (Spec
// docs/specs/garantiefall.md §6.1).
//
// Der Test zum Datum ist der wichtige: der Server schickt 'YYYY-MM-DD', und
// `new Date('2028-03-14')` liest UTC-Mitternacht — westlich von Greenwich
// stuende im Kopf ein anderer Tag als in der Projektliste, die
// `shared/warranty.ts::parseIsoDate` benutzt.

function projekt(over: Partial<Project> = {}): Project {
  return {
    id: 'p-1', project_id_text: '2024-018', name: 'Storen Meier',
    created_at: '2024-01-05T08:00:00+00:00', status: 'abgeschlossen',
    ...over,
  } as unknown as Project
}

function frist(over: Partial<WarrantyInfo> = {}): WarrantyInfo {
  return {
    state: 'in_garantie', anchor_kind: 'abnahme', anchor_at: '2026-03-14',
    deadline_at: '2028-03-14', expiry_at: '2031-03-14',
    ruegefrist_monate: 24, verjaehrung_monate: 60,
    ...over,
  }
}

function setup(over: {
  project?: Project
  warranty?: WarrantyInfo | null
  repairProjects?: RepairProjectRef[]
  repairCase?: RepairCaseRef | null
  onOpenProject?: (id: string) => void
} = {}) {
  render(
    <ProjectDetailHeader
      project={over.project ?? projekt()}
      isNew={false}
      status="abgeschlossen"
      beschaffungSteps={[]}
      beschaffung={null}
      beschaffungAt={null}
      beschaffungSource={null}
      warranty={over.warranty === undefined ? frist() : over.warranty}
      repairProjects={over.repairProjects ?? []}
      repairCase={over.repairCase ?? null}
      onOpenProject={over.onOpenProject ?? vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

afterEach(cleanup)

describe('Garantie-Vermerk', () => {
  it('nennt den Tag, bis zu dem die Garantie laeuft — ohne Zeitzonen-Versatz', () => {
    setup()
    expect(screen.getByText('Garantie bis 14.03.2028')).toBeTruthy()
  })

  it('nennt nach der Ruegefrist die Verjaehrung', () => {
    setup({ warranty: frist({ state: 'nur_verdeckte_maengel' }) })
    expect(screen.getByText(/Nur verdeckte Mängel bis 14\.03\.2031/)).toBeTruthy()
  })

  it('zeigt bei unbekannter Frist gar nichts', () => {
    setup({ warranty: frist({ state: 'unbekannt', deadline_at: null, expiry_at: null }) })
    expect(screen.queryByText(/Garantie/)).toBeNull()
  })

  it('zeigt nichts, solange die Auskunft fehlt (Feature aus oder noch am Laden)', () => {
    setup({ warranty: null })
    expect(screen.queryByText(/Garantie/)).toBeNull()
  })
})

describe('Rueckverweise', () => {
  it('springt vom Reparatur-Projekt zum Ursprungsprojekt', () => {
    const onOpenProject = vi.fn()
    setup({ project: projekt({ parent_project_id: 'p-alt' }), onOpenProject })

    fireEvent.click(screen.getByRole('button', { name: /Ursprungsprojekt/ }))

    expect(onOpenProject).toHaveBeenCalledWith('p-alt')
  })

  it('nennt am Reparatur-Projekt den Garantiefall (Phase 3)', () => {
    const onOpenProject = vi.fn()
    setup({
      project: projekt({ parent_project_id: 'p-alt' }),
      repairCase: { id: 'c-1', case_no: 217, decision: 'anerkannt', status: 'in_arbeit', source_project_id: 'p-alt' },
      onOpenProject,
    })
    fireEvent.click(screen.getByRole('button', { name: /Garantiefall G-217 · Ursprungsprojekt/ }))
    expect(onOpenProject).toHaveBeenCalledWith('p-alt')
  })

  it('listet die Nacharbeiten und springt hinein', () => {
    const onOpenProject = vi.fn()
    setup({
      onOpenProject,
      repairProjects: [{
        id: 'p-rep', project_id_text: '2026-004', name: 'Garantie: Storen Meier',
        status: 'offen', is_warranty: true, art_der_arbeit: ['Reparatur'],
        created_at: '2026-02-01T08:00:00+00:00',
      }],
    })

    expect(screen.getByText(/Nacharbeiten/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /2026-004/ }))

    expect(onOpenProject).toHaveBeenCalledWith('p-rep')
  })

  it('ohne Nacharbeiten keine leere Zeile', () => {
    setup()
    expect(screen.queryByText(/Nacharbeiten/)).toBeNull()
  })
})
