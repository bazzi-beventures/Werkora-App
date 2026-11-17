// Seitenpanel der Kachel «Rechnungsentwürfe»: lädt nur ausstehend/offen, zeigt
// den Hinweis «Evtl. bereits verrechnet», Klick auf die Karte öffnet das Projekt,
// die Knöpfe (Archivieren …) nicht.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Invoice } from '../../api/admin/invoices'

const listInvoices = vi.fn()
const archiveInvoice = vi.fn()
vi.mock('../../api/admin/invoices', async () => {
  const echt = await vi.importActual<Record<string, unknown>>('../../api/admin/invoices')
  return {
    ...echt,
    listInvoicesPage: async (q: unknown) => {
      const rows = await listInvoices(q)
      return { rows, total: rows.length, page: 1, page_size: 50 }
    },
    archiveInvoice: (id: number) => archiveInvoice(id),
  }
})

import { DraftInvoicesPanel } from './DraftInvoicesPanel'

function rechnung(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 77, invoice_number: 'RE-2026-077', project_name: 'Krüttli Seuzach HS', project_id: 'p-77',
    total_amount: 899.4, status: 'ausstehend', created_at: '2026-11-16T08:00:00Z', paid_at: null,
    projektleiter_id: null, evtl_bereits_verrechnet: false,
    ...over,
  } as Invoice
}

beforeEach(() => {
  listInvoices.mockReset().mockResolvedValue([rechnung()])
  archiveInvoice.mockReset().mockResolvedValue(undefined)
})

describe('DraftInvoicesPanel', () => {
  it('lädt nur ausstehend und offen', async () => {
    render(<DraftInvoicesPanel onClose={vi.fn()} onChanged={vi.fn()} />)
    await screen.findByText('Krüttli Seuzach HS')
    const q = listInvoices.mock.calls[0][0] as { statuses: Iterable<string> }
    expect([...q.statuses].sort()).toEqual(['ausstehend', 'offen'])
  })

  it('zeigt «Evtl. bereits verrechnet» nur, wo der Server es meldet', async () => {
    listInvoices.mockResolvedValue([
      rechnung(),
      rechnung({ id: 78, invoice_number: 'RE-2026-078', project_name: 'Seewald', evtl_bereits_verrechnet: true }),
    ])
    render(<DraftInvoicesPanel onClose={vi.fn()} onChanged={vi.fn()} />)
    await screen.findByText('Seewald')
    expect(screen.getAllByText('Evtl. bereits verrechnet')).toHaveLength(1)
  })

  it('öffnet beim Klick auf die Karte das Projekt', async () => {
    const onOpenProject = vi.fn()
    render(<DraftInvoicesPanel onClose={vi.fn()} onChanged={vi.fn()} onOpenProject={onOpenProject} />)
    await userEvent.click(await screen.findByText('Krüttli Seuzach HS'))
    expect(onOpenProject).toHaveBeenCalledWith('p-77')
  })

  it('«Archivieren» fragt nach, archiviert und meldet die Änderung — ohne ins Projekt zu springen', async () => {
    const onOpenProject = vi.fn()
    const onChanged = vi.fn()
    render(<DraftInvoicesPanel onClose={vi.fn()} onChanged={onChanged} onOpenProject={onOpenProject} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Archivieren' }))
    // Bestätigungsdialog: derselbe Knopftext, jetzt im Dialog.
    const knoepfe = await screen.findAllByRole('button', { name: 'Archivieren' })
    await userEvent.click(knoepfe[knoepfe.length - 1])
    await waitFor(() => expect(archiveInvoice).toHaveBeenCalledWith(77))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(onOpenProject).not.toHaveBeenCalled()
  })
})
