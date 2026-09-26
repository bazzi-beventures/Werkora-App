import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DashboardScreen from './DashboardScreen'
import type { AdminDashboard } from '../../api/admin'

// Spec docs/specs/rollierende-inventur.md §10.1, §11.
//
// Der Einstieg, um den es geht: Ein Tipp auf die Kachel führt in die offene
// Tranche — vorher waren es fünf Tipps, und zwar mit dem Handy in der einen und
// dem Karton in der anderen Hand.
//
// Die zweite Regel hier ist die unscheinbarere: `null` heisst «dieser Betrieb
// führt kein Lager», und dann fehlt die ganze Sektion. Eine Kachel «Inventur: 0
// zu zählen» wäre eine Zahl ohne Bedeutung, und ihr Klick führte in einen
// Reiter, den es nicht gibt.

vi.mock('../../api/admin', async () => {
  const echt = await vi.importActual<Record<string, unknown>>('../../api/admin')
  return {
    ...echt,
    getPendingReminderQuotes: vi.fn().mockResolvedValue([]),
    getPendingActionInvoices: vi.fn().mockResolvedValue([]),
    getPendingApprovals: vi.fn().mockResolvedValue([]),
    getOverdueProjects: vi.fn().mockResolvedValue([]),
  }
})

function dashboard(over: Partial<AdminDashboard> = {}): AdminDashboard {
  return {
    pending_corrections: 0, pending_absences: 0, open_invoices: 0, open_sessions: 0,
    draft_quotes: 0, quotes_pending_reminder: 0, invoices_pending_action: 0,
    pending_approvals: 0, projects_overdue: 0, pending_drafts: 0,
    recently_accepted_quotes: 0, recently_rejected_quotes: 0,
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('Lager-Sektion des Dashboards', () => {
  it('fehlt ganz, wenn der Betrieb kein Lager führt', () => {
    render(<DashboardScreen dashboard={dashboard()} onNav={vi.fn()} />)
    expect(screen.queryByText('Inventur: zu zählen')).toBeNull()
    expect(screen.queryByText('Lager')).toBeNull()
  })

  it('führt mit einem Tipp in die offene Tranche', () => {
    const onNav = vi.fn()
    render(
      <DashboardScreen
        dashboard={dashboard({
          inventory_count_open_items: 12,
          inventory_count_open_id: 'c1',
          inventory_below_min: 3,
        })}
        onNav={onNav}
      />,
    )
    fireEvent.click(screen.getByText('Inventur: zu zählen'))
    expect(onNav).toHaveBeenCalledWith('materials', 'inventur:c1')
  })

  it('landet ohne offene Zählung auf der Inventurseite', () => {
    const onNav = vi.fn()
    render(
      <DashboardScreen
        dashboard={dashboard({
          inventory_count_open_items: 0,
          inventory_count_open_id: null,
          inventory_below_min: 0,
        })}
        onNav={onNav}
      />,
    )
    fireEvent.click(screen.getByText('Inventur: zu zählen'))
    expect(onNav).toHaveBeenCalledWith('materials', 'inventur')
  })

  it('führt von «Unter Meldebestand» in den Reiter Lager', () => {
    const onNav = vi.fn()
    render(
      <DashboardScreen
        dashboard={dashboard({ inventory_count_open_items: 0, inventory_below_min: 5 })}
        onNav={onNav}
      />,
    )
    fireEvent.click(screen.getByText('Unter Meldebestand'))
    expect(onNav).toHaveBeenCalledWith('materials', 'lager')
  })
})
