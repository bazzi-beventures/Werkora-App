// Dirty-Signal der Rapport-Maske (onDirtyChange, analog QuoteEditForm):
// ProjectMaskDialogs entscheidet damit, ob ein Klick neben das Fenster direkt
// schliesst oder erst die Verwerfen-Rückfrage kommt. Der Vergleichswert darf im
// Bearbeiten-Modus NICHT der erste Render sein — der gespeicherte Stand lädt
// asynchron nach und würde sonst sofort als «geändert» gelten.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportCreateForm } from './ReportCreateForm'

vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../api/modules', () => ({ isFeatureEnabled: () => false }))
vi.mock('../../api/admin/materials', () => ({ listAllMaterials: vi.fn().mockResolvedValue([]) }))
vi.mock('../../api/admin/quotes', () => ({ getQuoteDetail: vi.fn() }))
vi.mock('../../api/admin/reports', () => ({
  saveProjectReport: vi.fn(),
  getProjectReport: vi.fn().mockResolvedValue({
    report_date: '2026-08-01',
    description: 'Gespeicherter Beschrieb',
    staff: [{ staff_id: 's1', name: 'Hans', hours: 2, hour_type: 'standard' }],
    materials: [],
    kleinmaterial: null,
    fixed_materials: [],
    editable: true,
  }),
}))

function renderForm(props: { editReportId?: number } = {}) {
  const onDirtyChange = vi.fn()
  render(
    <ReportCreateForm
      project={{ id: 'p1', name: 'Testprojekt' }}
      staff={[{ id: 's1', name: 'Hans' }]}
      quotes={[]}
      onDone={() => {}}
      onCancel={() => {}}
      onDirtyChange={onDirtyChange}
      {...props}
    />
  )
  return onDirtyChange
}

describe('ReportCreateForm — onDirtyChange', () => {
  it('meldet false nach dem Öffnen und true nach einer Eingabe', async () => {
    const spy = renderForm()
    await waitFor(() => expect(spy).toHaveBeenCalledWith(false))
    expect(spy).not.toHaveBeenCalledWith(true)

    await userEvent.type(screen.getByLabelText(/Arbeitsbeschrieb/), 'Storen montiert')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(true))
  })

  it('Bearbeiten-Modus: der nachgeladene Stand gilt als Basis, nicht der leere erste Render', async () => {
    const spy = renderForm({ editReportId: 5 })
    // Der gespeicherte Beschrieb ist da => Laden abgeschlossen, Basis gesetzt.
    await screen.findByDisplayValue('Gespeicherter Beschrieb')
    await waitFor(() => expect(spy).toHaveBeenCalledWith(false))
    expect(spy).not.toHaveBeenCalledWith(true)

    await userEvent.type(screen.getByLabelText(/Arbeitsbeschrieb/), ' — ergänzt')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(true))
  })
})
