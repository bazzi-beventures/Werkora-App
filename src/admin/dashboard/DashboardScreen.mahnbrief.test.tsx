import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DashboardScreen from './DashboardScreen'
import type { AdminDashboard, PendingActionInvoice } from '../../api/admin'
import * as adminApi from '../../api/admin'

// Feature-Anfrage WW-35 (docs/specs/mahnung-papier.md): Zahlungserinnerung und
// Mahnung auch als Brief, für Kunden, die ihre Rechnung per Post bekommen.
//
// Die Regel, um die es hier geht: das PDF zu öffnen vermerkt NICHTS. Die
// Zeitstempel der Mahnstufen steuern Dashboard und Aufgaben-Board — ein Blick
// auf die Vorschau darf die Rechnung nicht als «gemahnt» markieren. Erst der
// zweite Klick («vermerken») tut das.

vi.mock('../../api/admin', async () => {
  const echt = await vi.importActual<Record<string, unknown>>('../../api/admin')
  return {
    ...echt,
    getPendingReminderQuotes: vi.fn().mockResolvedValue([]),
    getPendingActionInvoices: vi.fn(),
    getPendingApprovals: vi.fn().mockResolvedValue([]),
    getOverdueProjects: vi.fn().mockResolvedValue([]),
    markReminderSentByPost: vi.fn().mockResolvedValue(undefined),
  }
})

function dashboard(): AdminDashboard {
  return {
    pending_corrections: 0, pending_absences: 0, open_invoices: 0, open_sessions: 0,
    draft_quotes: 0, quotes_pending_reminder: 0, invoices_pending_action: 1,
    pending_approvals: 0, projects_overdue: 0, pending_drafts: 0,
    recently_accepted_quotes: 0, recently_rejected_quotes: 0,
  }
}

const RECHNUNG: PendingActionInvoice = {
  id: 42, invoice_number: 'RE-2026-0815', project_id: 'p-1', project_name: 'Sanierung Bad',
  project_id_text: '2600515', customer_name: 'Peter Muster', total_amount: 1234.5,
  sent_at: '2026-08-20T09:00:00Z', due_date: '2026-09-19',
  zahlungserinnerung_sent_at: null, mahnung_sent_at: null,
}

async function oeffneMahnliste() {
  vi.mocked(adminApi.getPendingActionInvoices).mockResolvedValue([RECHNUNG])
  render(<DashboardScreen dashboard={dashboard()} onNav={vi.fn()} />)
  fireEvent.click(screen.getByText('Rechnungen überfällig'))
  await screen.findByText('RE-2026-0815')
}

beforeEach(() => vi.clearAllMocks())

describe('Mahnung als Brief', () => {
  it('verlinkt je Stufe das Brief-PDF', async () => {
    await oeffneMahnliste()
    expect(screen.getByText('Erinnerung als Brief (PDF)').closest('a'))
      .toHaveAttribute('href', expect.stringContaining('/pwa/admin/invoices/42/mahnschreiben.pdf?stufe=zahlungserinnerung'))
    expect(screen.getByText('Mahnung als Brief (PDF)').closest('a'))
      .toHaveAttribute('href', expect.stringContaining('/pwa/admin/invoices/42/mahnschreiben.pdf?stufe=mahnung'))
  })

  it('vermerkt beim Öffnen nichts, erst auf ausdrücklichen Klick', async () => {
    await oeffneMahnliste()
    fireEvent.click(screen.getByText('Mahnung als Brief (PDF)'))
    expect(adminApi.markReminderSentByPost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Als per Post versendet vermerken'))
    await waitFor(() =>
      expect(adminApi.markReminderSentByPost).toHaveBeenCalledWith(42, 'mahnung'))
    // Die Zeile zeigt die Stufe danach wie nach dem Mail-Versand.
    expect(await screen.findByText(/^Mahnung: /)).toBeInTheDocument()
    expect(screen.queryByText('Als per Post versendet vermerken')).toBeNull()
  })
})
