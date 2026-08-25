import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfigurationScreen from './ConfigurationScreen'
import { getSchedulingConfig, updateSchedulingConfig } from '../../api/admin'

// Client-apiFetch neutralisieren: der Default-Tab (Wochenplan) lädt beim Mount.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  ApiError: class ApiError extends Error {},
}))

// Echte Konstanten (SCHEDULING_KINDS/FIELDS) behalten, nur die zwei Calls mocken.
vi.mock('../../api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/admin')>()
  return { ...actual, getSchedulingConfig: vi.fn(), updateSchedulingConfig: vi.fn() }
})

const mockGet = vi.mocked(getSchedulingConfig)
const mockUpdate = vi.mocked(updateSchedulingConfig)

const DEFAULTS = {
  fields: { address: true, projektleiter: false, customer: false, bemerkung: false },
  colors: {
    project: '#3081ab', teamsitzung: '#7c3aed', lagerarbeit: '#d97706',
    werkstatt: '#0d9488', weiterbildung: '#db2777', reservation: '#65a30d',
    blocker: '#94a3b8', sonstiges: '#475569',
  },
  views: { month: true, week: true, staff: true, plantafel: true, gantt: true },
  grey_after: '',
  grey_until: '',
  day_capacity_hours: 8,
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function openTab() {
  const user = userEvent.setup()
  render(<ConfigurationScreen userRole="superadmin" />)
  await user.click(screen.getByRole('button', { name: 'Einsatzplanung' }))
  return user
}

describe('SchedulingTab', () => {
  it('lädt die Config und füllt Defaults auf (Adresse an, Projektleiter aus)', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    await openTab()

    const address = await screen.findByLabelText('Adresse (Objekt)')
    expect(address).toBeChecked()
    expect(screen.getByLabelText('Projektleiter')).not.toBeChecked()
  })

  it('Checkbox-Änderung aktiviert Speichern und sendet die neue Config', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    mockUpdate.mockResolvedValue({ config: { ...DEFAULTS, fields: { ...DEFAULTS.fields, projektleiter: true } } })
    const user = await openTab()

    await screen.findByLabelText('Adresse (Objekt)')
    const saveBtn = screen.getByRole('button', { name: 'Speichern' })
    expect(saveBtn).toBeDisabled()  // noch nichts geändert

    await user.click(screen.getByLabelText('Projektleiter'))
    expect(saveBtn).not.toBeDisabled()

    await user.click(saveBtn)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    const sent = mockUpdate.mock.calls[0][0]
    expect(sent.fields.projektleiter).toBe(true)
    expect(sent.fields.address).toBe(true)
    expect(sent.colors.project).toBe('#3081ab')
  })

  it('Config-Overrides gewinnen über Defaults', async () => {
    mockGet.mockResolvedValue({
      config: { fields: { bemerkung: true }, colors: { teamsitzung: '#111111' } },
      defaults: DEFAULTS,
    })
    await openTab()

    expect(await screen.findByLabelText('Bemerkung')).toBeChecked()
  })

  it('Ausgrau-Startzeit (von) wird geladen und mitgespeichert', async () => {
    mockGet.mockResolvedValue({ config: { grey_after: '12:00' }, defaults: DEFAULTS })
    mockUpdate.mockResolvedValue({ config: { ...DEFAULTS, grey_after: '13:30' } })
    const user = await openTab()

    const vonInput = await screen.findByLabelText('Ausgrauen von Uhrzeit')
    expect(vonInput).toHaveValue('12:00')

    const saveBtn = screen.getByRole('button', { name: 'Speichern' })
    expect(saveBtn).toBeDisabled()  // noch nichts geändert

    await user.clear(vonInput)
    await user.type(vonInput, '13:30')
    expect(saveBtn).not.toBeDisabled()

    await user.click(saveBtn)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate.mock.calls[0][0].grey_after).toBe('13:30')
  })

  it('Fenster-Ende (bis) wird gespeichert; "bis" ist ohne "von" deaktiviert', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    mockUpdate.mockResolvedValue({ config: { ...DEFAULTS, grey_after: '12:00', grey_until: '13:00' } })
    const user = await openTab()

    const bisInput = await screen.findByLabelText('Ausgrauen bis Uhrzeit')
    expect(bisInput).toBeDisabled()  // ohne 'von' kein 'bis'

    const vonInput = screen.getByLabelText('Ausgrauen von Uhrzeit')
    await user.type(vonInput, '12:00')
    expect(bisInput).not.toBeDisabled()

    await user.type(bisInput, '13:00')
    const saveBtn = screen.getByRole('button', { name: 'Speichern' })
    expect(saveBtn).not.toBeDisabled()

    await user.click(saveBtn)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate.mock.calls[0][0].grey_after).toBe('12:00')
    expect(mockUpdate.mock.calls[0][0].grey_until).toBe('13:00')
  })

  it('Ansicht abschalten wird mitgespeichert', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    mockUpdate.mockResolvedValue({ config: { ...DEFAULTS, views: { ...DEFAULTS.views, plantafel: false } } })
    const user = await openTab()

    const plantafel = await screen.findByLabelText('Plantafel')
    expect(plantafel).toBeChecked()  // Default: alle Ansichten an

    await user.click(plantafel)
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    const sent = mockUpdate.mock.calls[0][0]
    expect(sent.views?.plantafel).toBe(false)
    expect(sent.views?.month).toBe(true)
  })

  it('Speichern ist gesperrt, wenn alle Ansichten aus sind', async () => {
    mockGet.mockResolvedValue({ config: {}, defaults: DEFAULTS })
    const user = await openTab()

    await screen.findByLabelText('Plantafel')
    for (const label of ['Monat', 'Woche', 'Mitarbeiter', 'Plantafel', 'Tagesplan']) {
      await user.click(screen.getByLabelText(label))
    }
    expect(screen.getByText('Mindestens eine Ansicht muss aktiviert sein.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('Speichern ist gesperrt, wenn "bis" nicht nach "von" liegt', async () => {
    mockGet.mockResolvedValue({ config: { grey_after: '12:00', grey_until: '13:00' }, defaults: DEFAULTS })
    const user = await openTab()

    const bisInput = await screen.findByLabelText('Ausgrauen bis Uhrzeit')
    await user.clear(bisInput)
    await user.type(bisInput, '11:00')  // vor 'von'

    expect(screen.getByText('„Bis" muss nach „von" liegen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })
})
