import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeeklyPlanTab } from './WeeklyPlanTab'
import { getOvertimeResetSettings, getWeeklyPlan } from '../../../api/admin/hr'

// Der Tab rief showToast auf, renderte aber keinen ToastHost — «Wochenplan
// gespeichert» und «Laden/Speichern fehlgeschlagen» erschienen nie.

vi.mock('../../../api/admin/hr', () => ({
  getWeeklyPlan: vi.fn(),
  saveWeeklyPlan: vi.fn(),
  getOvertimeResetSettings: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(getWeeklyPlan).mockReset()
  vi.mocked(getOvertimeResetSettings).mockReset()
})

describe('WeeklyPlanTab', () => {
  it('zeigt einen Toast, wenn der Wochenplan nicht geladen werden kann', async () => {
    vi.mocked(getWeeklyPlan).mockRejectedValue(new Error('offline'))
    vi.mocked(getOvertimeResetSettings).mockResolvedValue({ soll_stunden_woche: 40 } as never)
    render(<WeeklyPlanTab />)
    expect(await screen.findByText('Laden fehlgeschlagen')).toBeInTheDocument()
  })
})
