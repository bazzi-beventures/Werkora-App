import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoicesTab } from './tabs'
import type { ProjectInvoice } from './tabs'

// docs/specs/bexio-anbindung.md §8.2 — die Pille steht auch im Projekt-Reiter
// «Rechnungen», nicht nur in der Rechnungsliste (Test mit dem Testkonto, 2026-11-01).

const getBexioStatus = vi.fn()
const cancelInBexio = vi.fn()
vi.mock('../../../api/admin/invoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/admin/invoices')>()
  return {
    ...actual,
    getBexioStatus: (ids: number[]) => getBexioStatus(ids),
    cancelInBexio: (id: number) => cancelInBexio(id),
  }
})

const INV: ProjectInvoice = {
  id: 31, parent_id: null, version: 2, invoice_number: 'RE-2026-031', total_amount: 902.65,
  status: 'gesendet', created_at: '2026-09-18T10:00:00Z', paid_at: null, storage_path: 'documents/re.pdf',
}

function renderTab(bexioOn: boolean, invoices: ProjectInvoice[] = [INV], onArchive = vi.fn().mockResolvedValue(undefined)) {
  render(
    <InvoicesTab
      invoices={invoices}
      useAcceptedQuote={false}
      generatingInvoice={false}
      defaultEmail="kunde@example.com"
      hasSignedReport={true}
      onUseAcceptedQuoteChange={vi.fn()}
      onGenerateInvoice={vi.fn().mockResolvedValue(true)}
      loadQuoteCoverage={vi.fn().mockResolvedValue(null)}
      loadWorkDescription={vi.fn().mockResolvedValue('')}
      loadBillableReports={vi.fn().mockResolvedValue(null)}
      loadAnzahlungen={vi.fn().mockResolvedValue(null)}
      onMarkPaid={vi.fn().mockResolvedValue(true)}
      onUnmarkPaid={vi.fn().mockResolvedValue(undefined)}
      onArchive={onArchive}
      onSendInvoice={vi.fn().mockResolvedValue(true)}
      onMarkSentByPost={vi.fn().mockResolvedValue(true)}
      bexioOn={bexioOn}
    />,
  )
}

beforeEach(() => { getBexioStatus.mockReset(); cancelInBexio.mockReset().mockResolvedValue(undefined) })

describe('InvoicesTab — bexio-Pille', () => {
  it('zeigt den Zustand neben dem Status', async () => {
    getBexioStatus.mockResolvedValue({ '31': { state: 'wird_uebertragen' } })
    renderTab(true)
    expect(await screen.findByText('bexio: wird übertragen')).toBeInTheDocument()
    expect(getBexioStatus).toHaveBeenCalledWith([31])
  })

  it('fragt ohne Modul nicht nach', () => {
    renderTab(false)
    expect(getBexioStatus).not.toHaveBeenCalled()
  })

  it('ein Fehler kostet nur die Pille', async () => {
    getBexioStatus.mockRejectedValue(new Error('offline'))
    renderTab(true)
    expect(await screen.findByText('RE-2026-031')).toBeInTheDocument()
    expect(screen.queryByText(/bexio:/)).toBeNull()
  })

  it('Archivieren einer gebuchten Rechnung merkt das Storno in bexio vor (§6.7)', async () => {
    getBexioStatus.mockResolvedValue({ '31': { state: 'in_bexio', bexio_id: 3 } })
    const onArchive = vi.fn().mockResolvedValue(undefined)
    renderTab(true, [INV], onArchive)
    await screen.findByText('in bexio')
    await userEvent.click(screen.getByRole('button', { name: 'Archivieren' }))
    expect(screen.getByRole('checkbox', { name: /Auch in bexio stornieren/ })).toBeChecked()
    await userEvent.click(screen.getAllByRole('button', { name: 'Archivieren' }).slice(-1)[0])
    expect(onArchive).toHaveBeenCalledWith(31)
    expect(cancelInBexio).toHaveBeenCalledWith(31)
  })

  it('ohne Häkchen nur archivieren', async () => {
    getBexioStatus.mockResolvedValue({ '31': { state: 'in_bexio', bexio_id: 3 } })
    const onArchive = vi.fn().mockResolvedValue(undefined)
    renderTab(true, [INV], onArchive)
    await screen.findByText('in bexio')
    await userEvent.click(screen.getByRole('button', { name: 'Archivieren' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Auch in bexio stornieren/ }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Archivieren' }).slice(-1)[0])
    expect(onArchive).toHaveBeenCalledWith(31)
    expect(cancelInBexio).not.toHaveBeenCalled()
  })

  it('Pille «Storno offen» fragt nach und merkt vor', async () => {
    getBexioStatus.mockResolvedValue({ '31': { state: 'storno_offen' } })
    renderTab(true, [{ ...INV, status: 'archiviert' }])
    await userEvent.click(await screen.findByRole('button', { name: 'bexio: Storno offen' }))
    await userEvent.click(screen.getByRole('button', { name: 'In bexio stornieren' }))
    expect(cancelInBexio).toHaveBeenCalledWith(31)
  })
})
