import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoicesTab } from './tabs'
import type { ProjectInvoice } from './tabs'
import { todayISO } from '../../utils/format'

function makeInvoice(over: Partial<ProjectInvoice> = {}): ProjectInvoice {
  return {
    id: 1,
    parent_id: null,
    version: 1,
    invoice_number: 'RE-2026-083',
    total_amount: 4159.5,
    status: 'ausstehend',
    created_at: '2026-08-09T10:00:00Z',
    paid_at: null,
    storage_path: 'documents/re-2026-083.pdf',
    ...over,
  }
}

function renderTab(
  invoices: ProjectInvoice[],
  onMarkSentByPost = vi.fn().mockResolvedValue(true),
  onMarkPaid = vi.fn().mockResolvedValue(true),
) {
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
      onMarkPaid={onMarkPaid}
      onUnmarkPaid={vi.fn().mockResolvedValue(undefined)}
      onArchive={vi.fn().mockResolvedValue(undefined)}
      onSendInvoice={vi.fn().mockResolvedValue(true)}
      onMarkSentByPost={onMarkSentByPost}
    />,
  )
  return onMarkSentByPost
}

describe('InvoicesTab — Postversand', () => {
  it('zeigt «Per Post versendet» bei einer offenen Rechnung mit PDF', () => {
    renderTab([makeInvoice()])
    expect(screen.getByRole('button', { name: 'Per Post versendet' })).toBeInTheDocument()
  })

  it('meldet den Postversand mit dem heutigen Datum als Vorgabe', async () => {
    const onMarkSentByPost = renderTab([makeInvoice({ id: 42 })])
    await userEvent.click(screen.getByRole('button', { name: 'Per Post versendet' }))

    // Der Dialog nennt Nummer und Betrag, damit man vor dem Klick sieht, was man markiert.
    expect(screen.getByText('Als per Post versendet markieren?')).toBeInTheDocument()
    const dateInput = screen.getByLabelText('Aufgabedatum') as HTMLInputElement
    expect(dateInput.value).toBe(todayISO())

    await userEvent.click(screen.getByRole('button', { name: 'Als versendet markieren' }))
    expect(onMarkSentByPost).toHaveBeenCalledWith(42, todayISO())
  })

  it('reicht ein zurückdatiertes Aufgabedatum durch', async () => {
    const onMarkSentByPost = renderTab([makeInvoice({ id: 7 })])
    await userEvent.click(screen.getByRole('button', { name: 'Per Post versendet' }))

    const dateInput = screen.getByLabelText('Aufgabedatum')
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-08-03')

    await userEvent.click(screen.getByRole('button', { name: 'Als versendet markieren' }))
    expect(onMarkSentByPost).toHaveBeenCalledWith(7, '2026-08-03')
  })

  it('lässt den Dialog offen, wenn das Backend ablehnt — die Meldung soll lesbar bleiben', async () => {
    const onMarkSentByPost = vi.fn().mockResolvedValue(false)
    renderTab([makeInvoice()], onMarkSentByPost)
    await userEvent.click(screen.getByRole('button', { name: 'Per Post versendet' }))
    await userEvent.click(screen.getByRole('button', { name: 'Als versendet markieren' }))

    expect(screen.getByText('Als per Post versendet markieren?')).toBeInTheDocument()
  })

  it('bietet den Postversand nicht ohne PDF an — der Endpunkt lehnte mit 409 ab', () => {
    renderTab([makeInvoice({ storage_path: null })])
    expect(screen.queryByRole('button', { name: 'Per Post versendet' })).not.toBeInTheDocument()
  })

  it('bietet den Postversand nicht bei einer bereits gesendeten Rechnung an', () => {
    renderTab([makeInvoice({ status: 'gesendet' })])
    // «Senden» (erneut mailen) bleibt, der Postversand verschwindet: sent_at und
    // Zahlungsziel stehen bereits.
    expect(screen.getByRole('button', { name: 'Senden' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Per Post versendet' })).not.toBeInTheDocument()
  })

  it('bietet den Postversand nicht bei bezahlten oder archivierten Rechnungen an', () => {
    renderTab([makeInvoice({ status: 'bezahlt' })])
    expect(screen.queryByRole('button', { name: 'Per Post versendet' })).not.toBeInTheDocument()
  })

  it('bietet den Postversand nur auf der neuesten Version an', () => {
    renderTab([
      makeInvoice({ id: 2, version: 2, parent_id: 1, invoice_number: 'RE-2026-084' }),
      makeInvoice({ id: 1, version: 1, parent_id: 1 }),
    ])
    expect(screen.getAllByRole('button', { name: 'Per Post versendet' })).toHaveLength(1)
  })
})

describe('InvoicesTab — bezahlt markieren', () => {
  it('fragt vor dem Markieren nach und schlägt heute als Zahlungsdatum vor', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(true)
    renderTab([makeInvoice({ id: 42 })], undefined, onMarkPaid)
    await userEvent.click(screen.getByRole('button', { name: 'Bezahlt' }))

    // Vorher wurde ohne Rückfrage sofort mit dem Klick-Zeitpunkt gebucht.
    expect(onMarkPaid).not.toHaveBeenCalled()
    expect(screen.getByText('Rechnung als bezahlt markieren?')).toBeInTheDocument()
    expect((screen.getByLabelText('Zahlungsdatum') as HTMLInputElement).value).toBe(todayISO())

    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))
    expect(onMarkPaid).toHaveBeenCalledWith(42, todayISO())
  })

  it('reicht ein nachgetragenes Zahlungsdatum durch', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(true)
    renderTab([makeInvoice({ id: 7 })], undefined, onMarkPaid)
    await userEvent.click(screen.getByRole('button', { name: 'Bezahlt' }))

    const dateInput = screen.getByLabelText('Zahlungsdatum')
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-08-11')
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(onMarkPaid).toHaveBeenCalledWith(7, '2026-08-11')
  })

  it('lässt den Dialog offen, wenn das Backend das Datum ablehnt', async () => {
    renderTab([makeInvoice()], undefined, vi.fn().mockResolvedValue(false))
    await userEvent.click(screen.getByRole('button', { name: 'Bezahlt' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(screen.getByText('Rechnung als bezahlt markieren?')).toBeInTheDocument()
  })

  it('bricht ohne Markierung ab', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(true)
    renderTab([makeInvoice()], undefined, onMarkPaid)
    await userEvent.click(screen.getByRole('button', { name: 'Bezahlt' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(onMarkPaid).not.toHaveBeenCalled()
    expect(screen.queryByText('Rechnung als bezahlt markieren?')).not.toBeInTheDocument()
  })
})
