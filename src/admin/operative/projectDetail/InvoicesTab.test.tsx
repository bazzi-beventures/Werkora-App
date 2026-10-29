import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoicesTab } from './tabs'
import type { ProjectInvoice } from './tabs'
import { todayISO } from '../../utils/format'
import type { BillableReport, OpenAnzahlung } from '../../../api/admin/invoices'

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
      loadWorkDescription={vi.fn().mockResolvedValue('')}
      loadBillableReports={vi.fn().mockResolvedValue(null)}
      loadAnzahlungen={vi.fn().mockResolvedValue(null)}
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
    expect(onMarkPaid).toHaveBeenCalledWith(42, todayISO(), null)
  })

  it('reicht ein nachgetragenes Zahlungsdatum durch', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(true)
    renderTab([makeInvoice({ id: 7 })], undefined, onMarkPaid)
    await userEvent.click(screen.getByRole('button', { name: 'Bezahlt' }))

    const dateInput = screen.getByLabelText('Zahlungsdatum')
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-08-11')
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))

    expect(onMarkPaid).toHaveBeenCalledWith(7, '2026-08-11', null)
  })

  it('Skontoabzug: eingegangener Betrag geht mit, Überzahlung sperrt (WW-19)', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(true)
    renderTab([makeInvoice({ id: 7 })], undefined, onMarkPaid)
    await userEvent.click(screen.getByRole('button', { name: 'Bezahlt' }))
    const amount = screen.getByLabelText('Eingegangener Betrag (CHF)')
    expect((amount as HTMLInputElement).value).toBe('4159.50')

    await userEvent.clear(amount)
    await userEvent.type(amount, '5000')
    expect(screen.getByRole('button', { name: 'Ja, bezahlt' })).toBeDisabled()

    await userEvent.clear(amount)
    await userEvent.type(amount, '4076.30')
    await userEvent.click(screen.getByRole('button', { name: 'Ja, bezahlt' }))
    expect(onMarkPaid).toHaveBeenCalledWith(7, todayISO(), 4076.3)
  })

  it('zeigt bei bezahlter Rechnung, was tatsächlich einging', () => {
    renderTab([makeInvoice({ status: 'bezahlt', paid_at: '2026-08-20', paid_amount: 4076.3 })])
    expect(screen.getByText(/erhalten CHF 4.076,30|erhalten CHF 4’076.30|erhalten CHF 4'076.30/)).toBeTruthy()
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

describe('InvoicesTab — Ausgeführte Arbeiten (WW-52)', () => {
  function renderGenerate(loadWorkDescription: () => Promise<string>) {
    const onGenerateInvoice = vi.fn().mockResolvedValue(true)
    const loadBillableReports = vi.fn().mockResolvedValue(null)
    const loadAnzahlungen = vi.fn().mockResolvedValue(null)
    render(
      <InvoicesTab
        invoices={[]}
        useAcceptedQuote={false}
        generatingInvoice={false}
        defaultEmail=""
        hasSignedReport={true}
        onUseAcceptedQuoteChange={vi.fn()}
        onGenerateInvoice={onGenerateInvoice}
        loadQuoteCoverage={vi.fn().mockResolvedValue(null)}
        loadWorkDescription={loadWorkDescription}
        loadBillableReports={loadBillableReports}
        loadAnzahlungen={loadAnzahlungen}
        onMarkPaid={vi.fn().mockResolvedValue(true)}
        onUnmarkPaid={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn().mockResolvedValue(undefined)}
        onSendInvoice={vi.fn().mockResolvedValue(true)}
        onMarkSentByPost={vi.fn().mockResolvedValue(true)}
      />,
    )
    return onGenerateInvoice
  }

  it('zeigt den Vorschlag aus den Rapporten und schickt den bearbeiteten Text mit', async () => {
    const onGenerate = renderGenerate(vi.fn().mockResolvedValue('07.10.2026 — Montage Plissee'))
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    const feld = await screen.findByDisplayValue('07.10.2026 — Montage Plissee')
    await userEvent.clear(feld)
    await userEvent.type(feld, 'Lieferung und Montage gemäss Offerte')
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerate).toHaveBeenCalledWith('', expect.objectContaining({ mode: 'replace', workDescription: 'Lieferung und Montage gemäss Offerte' }))
  })

  it('Häkchen weg → leerer Text, der Block entfällt auf dem PDF', async () => {
    const onGenerate = renderGenerate(vi.fn().mockResolvedValue('07.10.2026 — Montage Plissee'))
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    await screen.findByDisplayValue('07.10.2026 — Montage Plissee')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ausgeführte Arbeiten auf der Rechnung' }))
    expect(screen.queryByLabelText('Ausgeführte Arbeiten')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerate).toHaveBeenCalledWith('', expect.objectContaining({ workDescription: '' }))
  })

  it('Vorschlag nicht geladen → nichts mitschicken, der Server leitet ab', async () => {
    const onGenerate = renderGenerate(vi.fn().mockRejectedValue(new Error('offline')))
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    await screen.findByPlaceholderText(/Vorschlag nicht geladen/)
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerate).toHaveBeenCalledWith('', expect.objectContaining({ workDescription: undefined }))
  })
})

describe('InvoicesTab — weitere Rechnung (WW-39/WW-47)', () => {
  function renderWith(
    invoices: ProjectInvoice[],
    opts: { reports?: BillableReport[]; anzahlungen?: OpenAnzahlung[] } = {},
  ) {
    const onGenerateInvoice = vi.fn().mockResolvedValue(true)
    const loadWorkDescription = vi.fn().mockResolvedValue('')
    const loadQuoteCoverage = vi.fn().mockResolvedValue(null)
    const loadBillableReports = vi.fn().mockResolvedValue(opts.reports ?? null)
    const loadAnzahlungen = vi.fn().mockResolvedValue(opts.anzahlungen ?? null)
    render(
      <InvoicesTab
        invoices={invoices}
        useAcceptedQuote={false}
        generatingInvoice={false}
        defaultEmail=""
        hasSignedReport={true}
        onUseAcceptedQuoteChange={vi.fn()}
        onGenerateInvoice={onGenerateInvoice}
        loadQuoteCoverage={loadQuoteCoverage}
        loadWorkDescription={loadWorkDescription}
        loadBillableReports={loadBillableReports}
        loadAnzahlungen={loadAnzahlungen}
        onMarkPaid={vi.fn().mockResolvedValue(true)}
        onUnmarkPaid={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn().mockResolvedValue(undefined)}
        onSendInvoice={vi.fn().mockResolvedValue(true)}
        onMarkSentByPost={vi.fn().mockResolvedValue(true)}
      />,
    )
    return { onGenerateInvoice, loadWorkDescription, loadQuoteCoverage }
  }

  it('ohne gültige Rechnung keine Frage', async () => {
    renderWith([makeInvoice({ status: 'archiviert' })])
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    expect(screen.queryByRole('radio', { name: /Weitere Rechnung/ })).not.toBeInTheDocument()
  })

  it('weitere Rechnung lädt die Vorschläge neu und schickt additional mit', async () => {
    const { onGenerateInvoice, loadWorkDescription, loadQuoteCoverage } = renderWith([makeInvoice()])
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    expect(screen.getByRole('radio', { name: /Neue Version/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Weitere Rechnung/ }))
    expect(loadWorkDescription).toHaveBeenLastCalledWith(true, undefined)
    expect(loadQuoteCoverage).toHaveBeenLastCalledWith(true)
    await screen.findByPlaceholderText(/Eigenen Text schreiben/)
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerateInvoice).toHaveBeenCalledWith('', expect.objectContaining({ mode: 'additional', workDescription: '' }))
  })
})

describe('InvoicesTab — Rapport-Auswahl und Anzahlung', () => {
  function renderTabWith(invoices: ProjectInvoice[], opts: {
    reports?: BillableReport[]; anzahlungen?: OpenAnzahlung[]
  } = {}) {
    const onGenerateInvoice = vi.fn().mockResolvedValue(true)
    const loadWorkDescription = vi.fn().mockResolvedValue('')
    render(
      <InvoicesTab
        invoices={invoices}
        useAcceptedQuote={false}
        generatingInvoice={false}
        defaultEmail=""
        hasSignedReport={true}
        onUseAcceptedQuoteChange={vi.fn()}
        onGenerateInvoice={onGenerateInvoice}
        loadQuoteCoverage={vi.fn().mockResolvedValue(null)}
        loadWorkDescription={loadWorkDescription}
        loadBillableReports={vi.fn().mockResolvedValue(opts.reports ?? null)}
        loadAnzahlungen={vi.fn().mockResolvedValue(opts.anzahlungen ?? null)}
        onMarkPaid={vi.fn().mockResolvedValue(true)}
        onUnmarkPaid={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn().mockResolvedValue(undefined)}
        onSendInvoice={vi.fn().mockResolvedValue(true)}
        onMarkSentByPost={vi.fn().mockResolvedValue(true)}
      />,
    )
    return { onGenerateInvoice, loadWorkDescription }
  }

  const R = (id: number, date: string): BillableReport => ({
    id, report_date: date, created_by: 'Monteur', description: 'Montage', hours: 4, signed: true,
  })

  it('abgewählter Rapport bleibt offen und der Vorschlag lädt neu', async () => {
    const { onGenerateInvoice, loadWorkDescription } = renderTabWith([], {
      reports: [R(1, '2026-10-01'), R(2, '2026-10-02')],
    })
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Rapport vom 02.10.2026' }))
    expect(screen.getByText(/1 Rapport bleibt für eine spätere Rechnung offen/)).toBeInTheDocument()
    expect(loadWorkDescription).toHaveBeenLastCalledWith(false, [1])
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerateInvoice).toHaveBeenCalledWith('', expect.objectContaining({ reportIds: [1] }))
  })

  it('alle Rapporte angehakt → keine Auswahl (Automatik)', async () => {
    const { onGenerateInvoice } = renderTabWith([], { reports: [R(1, '2026-10-01'), R(2, '2026-10-02')] })
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    await screen.findByRole('checkbox', { name: 'Rapport vom 01.10.2026' })
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerateInvoice).toHaveBeenCalledWith('', expect.objectContaining({ reportIds: undefined }))
  })

  it('Anzahlung schickt Art und Satz', async () => {
    const { onGenerateInvoice } = renderTabWith([])
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    await userEvent.click(screen.getByRole('radio', { name: /Anzahlung/ }))
    const pct = screen.getByLabelText('Anzahlung in %')
    await userEvent.clear(pct)
    await userEvent.type(pct, '30')
    expect(screen.queryByRole('checkbox', { name: 'Ausgeführte Arbeiten auf der Rechnung' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Anzahlung erstellen' }))
    expect(onGenerateInvoice).toHaveBeenCalledWith('', expect.objectContaining({ mode: 'anzahlung', anzahlungPct: 30 }))
  })

  it('offene Anzahlung ist zum Abzug vorbelegt und abwählbar', async () => {
    const { onGenerateInvoice } = renderTabWith([], {
      anzahlungen: [{ id: 10, invoice_number: 'RE-10', total_amount: 540.55, status: 'bezahlt',
        created_at: '2026-10-01T09:00:00Z', anzahlung_pct: 50 }],
    })
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    const box = await screen.findByRole('checkbox', { name: /RE-10/ })
    expect(box).toBeChecked()
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerateInvoice).toHaveBeenCalledWith('', expect.objectContaining({ anzahlungIds: [] }))
  })
})

describe('InvoicesTab — Fahrzeitkosten', () => {
  it('abwählbar, angehakt als Vorgabe', async () => {
    const onGenerateInvoice = vi.fn().mockResolvedValue(true)
    render(
      <InvoicesTab
        invoices={[]}
        useAcceptedQuote={false}
        generatingInvoice={false}
        defaultEmail=""
        hasSignedReport={true}
        onUseAcceptedQuoteChange={vi.fn()}
        onGenerateInvoice={onGenerateInvoice}
        loadQuoteCoverage={vi.fn().mockResolvedValue(null)}
        loadWorkDescription={vi.fn().mockResolvedValue('')}
        loadBillableReports={vi.fn().mockResolvedValue(null)}
        loadAnzahlungen={vi.fn().mockResolvedValue(null)}
        onMarkPaid={vi.fn().mockResolvedValue(true)}
        onUnmarkPaid={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn().mockResolvedValue(undefined)}
        onSendInvoice={vi.fn().mockResolvedValue(true)}
        onMarkSentByPost={vi.fn().mockResolvedValue(true)}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung generieren' }))
    const box = screen.getByRole('checkbox', { name: 'Fahrzeitkosten verrechnen' })
    expect(box).toBeChecked()
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('button', { name: 'Rechnung generieren' }))
    expect(onGenerateInvoice).toHaveBeenCalledWith('', expect.objectContaining({ includeTravel: false }))
  })
})
