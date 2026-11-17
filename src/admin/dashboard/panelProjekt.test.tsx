// Alle Dashboard-Panels: Klick auf die Karte öffnet das Projekt, ein Klick auf
// einen Knopf erledigt nur seine Aktion (projektKarte.ts).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PendingActionInvoice, PendingApproval } from '../../api/admin'
import * as adminApi from '../../api/admin'
import { MahnungModal } from './MahnungModal'
import { ApprovalModal } from './ApprovalModal'

vi.mock('../../api/admin', async () => {
  const echt = await vi.importActual<Record<string, unknown>>('../../api/admin')
  return {
    ...echt,
    getPendingActionInvoices: vi.fn(),
    sendZahlungserinnerung: vi.fn().mockResolvedValue(undefined),
    getPendingApprovals: vi.fn(),
    approveApproval: vi.fn().mockResolvedValue(undefined),
  }
})

const RECHNUNG: PendingActionInvoice = {
  id: 42, invoice_number: 'RE-2026-0815', project_id: 'p-1', project_name: 'Sanierung Bad',
  project_id_text: '2600515', customer_name: 'Peter Muster', total_amount: 1234.5,
  sent_at: '2026-08-20T09:00:00Z', due_date: '2026-09-19',
  zahlungserinnerung_sent_at: null, mahnung_sent_at: null,
}

const FREIGABE: PendingApproval = {
  id: 'a-1', title: 'Bestellung Lamellen', filename: 'bestellung.pdf', storage_path: null,
  mime_type: 'application/pdf', requested_by_name: 'Marc', created_at: '2026-11-10T08:00:00Z',
  project_id: 'p-2', project_name: 'Schulhaus Ebni',
}

beforeEach(() => {
  vi.mocked(adminApi.getPendingActionInvoices).mockResolvedValue([RECHNUNG])
  vi.mocked(adminApi.getPendingApprovals).mockResolvedValue([FREIGABE])
})

describe('Dashboard-Panels → Projekt', () => {
  it('Überfällige Rechnungen: Karte öffnet das Projekt, «Zahlungserinnerung» nicht', async () => {
    const onOpenProject = vi.fn()
    const onSent = vi.fn()
    render(<MahnungModal onClose={vi.fn()} onSent={onSent} onOpenProject={onOpenProject} />)
    fireEvent.click(await screen.findByText('RE-2026-0815'))
    expect(onOpenProject).toHaveBeenCalledWith('p-1')

    onOpenProject.mockClear()
    fireEvent.click(screen.getByText('Zahlungserinnerung'))
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('Bestellfreigaben: Karte öffnet das Projekt, «Freigeben» nicht', async () => {
    const onOpenProject = vi.fn()
    const onSent = vi.fn()
    render(<ApprovalModal onClose={vi.fn()} onSent={onSent} onOpenProject={onOpenProject} />)
    fireEvent.click(await screen.findByText('Bestellung Lamellen'))
    expect(onOpenProject).toHaveBeenCalledWith('p-2')

    onOpenProject.mockClear()
    fireEvent.click(screen.getByText('Freigeben'))
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    expect(onOpenProject).not.toHaveBeenCalled()
  })
})
