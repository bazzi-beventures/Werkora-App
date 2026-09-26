import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WarrantyCase } from '../../../api/admin/warranty'
import type { UseProjectDocuments } from './useProjectDocuments'
import { WarrantyTab } from './WarrantyTab'

// Reiter «Garantie» (docs/specs/garantiefall.md Phase 2). Die Regeln selbst
// (Übergänge, Frist einfrieren) prüft der Server; hier zählt, dass der Reiter
// sie weiterreicht statt sie nachzubauen.

const listWarrantyCases = vi.fn()
const createWarrantyCase = vi.fn()
const updateWarrantyCase = vi.fn()
const createWarrantyRepairProject = vi.fn()
vi.mock('../../../api/admin/warranty', () => ({
  createWarrantyRepairProject: (...a: unknown[]) => createWarrantyRepairProject(...a),
  listWarrantyCases: (...a: unknown[]) => listWarrantyCases(...a),
  createWarrantyCase: (...a: unknown[]) => createWarrantyCase(...a),
  updateWarrantyCase: (...a: unknown[]) => updateWarrantyCase(...a),
}))
const listSuppliers = vi.fn()
vi.mock('../../../api/admin/suppliers', () => ({
  listSuppliers: (...a: unknown[]) => listSuppliers(...a),
}))

const DOCS: UseProjectDocuments = {
  files: [], setFiles: vi.fn(), uploading: false, uploadingCategory: null,
  confirmDeleteId: null, setConfirmDeleteId: vi.fn(), deleting: false,
  reload: vi.fn(), upload: vi.fn(), remove: vi.fn(), rename: vi.fn(),
}

const WARRANTY = {
  state: 'in_garantie' as const, anchor_kind: 'abnahme' as const, anchor_at: '2025-01-10',
  deadline_at: '2099-01-10', expiry_at: '2099-06-10', ruegefrist_monate: 24, verjaehrung_monate: 60,
}

function fall(over: Partial<WarrantyCase> = {}): WarrantyCase {
  return {
    id: 'c-1', case_no: 217, source_project_id: 'p-1', repair_project_id: null,
    customer_id: null, reported_at: '2026-02-01', reported_via: 'telefon', reported_by_name: null,
    description: 'Store klemmt', deadline_at: '2027-01-10', expiry_at: '2030-01-10',
    status: 'gemeldet', decision: null, decided_at: null, decided_by_name: null,
    decision_note: null, cause: null, supplier_id: null, resolved_at: null, closed_at: null,
    created_by_name: null, created_at: '2026-02-01T08:00:00Z',
    allowed_transitions: ['in_pruefung', 'entschieden'], within_deadline: true,
    ...over,
  }
}

const onToast = vi.fn()

const onOpenProject = vi.fn()

function renderTab(status: 'offen' | 'abgeschlossen' = 'abgeschlossen', warranty: typeof WARRANTY | null = WARRANTY) {
  return render(
    <WarrantyTab
      projectId="p-1" projectStatus={status} warranty={warranty} documents={DOCS}
      onToast={onToast} onOpenProject={onOpenProject}
    />,
  )
}

describe('WarrantyTab', () => {
  beforeEach(() => {
    listWarrantyCases.mockReset().mockResolvedValue([fall()])
    createWarrantyCase.mockReset()
    updateWarrantyCase.mockReset()
    listSuppliers.mockReset().mockResolvedValue([{ id: 's-1', name: 'Griesser', prefix: 'GRI' }])
    onToast.mockReset()
    onOpenProject.mockReset()
    createWarrantyRepairProject.mockReset()
  })
  afterEach(cleanup)

  it('listet die Fälle des Projekts', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    expect(listWarrantyCases).toHaveBeenCalledWith('p-1')
    expect(screen.getByText(/in Frist/)).toBeTruthy()
  })

  it('offenes Projekt: Melden gesperrt', async () => {
    renderTab('offen')
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    expect((screen.getByRole('button', { name: '+ Garantiefall melden' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Melden zeigt den Frist-Stand vor dem Speichern und schickt die Meldung', async () => {
    createWarrantyCase.mockResolvedValue(fall({ id: 'c-2', case_no: 218, description: 'Motor brummt' }))
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ Garantiefall melden' }))
    expect(screen.getByTestId('warranty-frist-hinweis').textContent).toContain('liegt innerhalb')

    fireEvent.change(screen.getByLabelText('Mangel *'), { target: { value: '  Motor brummt ' } })
    fireEvent.change(screen.getByLabelText('Meldeweg'), { target: { value: 'mail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Melden' }))

    await waitFor(() => expect(screen.getByText('G-218')).toBeTruthy())
    const body = createWarrantyCase.mock.calls[0][0]
    expect(body).toMatchObject({ source_project_id: 'p-1', description: 'Motor brummt', reported_via: 'mail' })
    expect(body.cause).toBeNull()
  })

  it('ohne Fristen-Flag: kein Frist-Hinweis im Dialog', async () => {
    renderTab('abgeschlossen', null)
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ Garantiefall melden' }))
    expect(screen.queryByTestId('warranty-frist-hinweis')).toBeNull()
  })

  it('Fall-Ansicht: Entscheid speichern schickt nur den Entscheid', async () => {
    updateWarrantyCase.mockResolvedValue(fall({
      status: 'entschieden', decision: 'kulanz',
      allowed_transitions: ['in_pruefung', 'in_arbeit', 'behoben', 'abgeschlossen'],
    }))
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByTestId('warranty-case-c-1'))
    fireEvent.change(screen.getByLabelText('Entscheid'), { target: { value: 'kulanz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entscheid speichern' }))

    await waitFor(() => expect(updateWarrantyCase).toHaveBeenCalledWith('c-1', { decision: 'kulanz' }))
    // Die Knöpfe kommen vom Server: nach dem Entscheid gibt es «Abschliessen».
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abschliessen' })).toBeTruthy())
  })

  it('Lieferant erst bei Ursache «Material»', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByTestId('warranty-case-c-1'))
    expect(screen.queryByLabelText('Lieferant')).toBeNull()
    fireEvent.change(screen.getByLabelText('Ursache'), { target: { value: 'material' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Griesser' })).toBeTruthy())
  })

  it('Fehler des Servers landen als Meldung, nicht still', async () => {
    updateWarrantyCase.mockRejectedValue(new Error('Dieser Statuswechsel ist nicht vorgesehen.'))
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByTestId('warranty-case-c-1'))
    fireEvent.click(screen.getByRole('button', { name: 'In Prüfung nehmen' }))
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('Dieser Statuswechsel ist nicht vorgesehen.', 'error'))
  })

  it('Reparatur-Projekt: anlegen nach dem Entscheid, danach öffnen', async () => {
    const entschieden = fall({
      status: 'entschieden', decision: 'anerkannt',
      allowed_transitions: ['in_pruefung', 'in_arbeit', 'behoben', 'abgeschlossen'],
    })
    listWarrantyCases.mockResolvedValue([entschieden])
    createWarrantyRepairProject.mockResolvedValue({
      case: { ...entschieden, status: 'in_arbeit', repair_project_id: 'r-1', allowed_transitions: ['behoben'] },
      project: { id: 'r-1' },
    })
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByTestId('warranty-case-c-1'))
    expect(screen.getByTestId('warranty-repair-section').textContent).toContain('als Garantiefall angelegt')

    fireEvent.click(screen.getByRole('button', { name: 'Reparatur-Projekt anlegen' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reparatur-Projekt öffnen' })).toBeTruthy())
    expect(createWarrantyRepairProject).toHaveBeenCalledWith('c-1')

    fireEvent.click(screen.getByRole('button', { name: 'Reparatur-Projekt öffnen' }))
    expect(onOpenProject).toHaveBeenCalledWith('r-1')
  })

  it('Reparatur-Projekt: gesperrt, solange der Entscheid nicht gespeichert ist', async () => {
    listWarrantyCases.mockResolvedValue([fall({
      status: 'entschieden', decision: 'anerkannt',
      allowed_transitions: ['in_pruefung', 'in_arbeit', 'behoben', 'abgeschlossen'],
    })])
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByTestId('warranty-case-c-1'))
    fireEvent.change(screen.getByLabelText('Entscheid'), { target: { value: 'abgelehnt' } })
    expect((screen.getByRole('button', { name: 'Reparatur-Projekt anlegen' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('ohne Entscheid kein Reparatur-Abschnitt', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('G-217')).toBeTruthy())
    fireEvent.click(screen.getByTestId('warranty-case-c-1'))
    expect(screen.queryByTestId('warranty-repair-section')).toBeNull()
  })
})
