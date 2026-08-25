import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReconcileResponse, ReconcileResult } from '../../api/admin/payments'

let mobile = true
vi.mock('../useIsMobile', () => ({ useIsMobile: () => mobile }))

const reconcileCamt = vi.fn()
vi.mock('../../api/admin', () => ({
  reconcileCamt: (file: File, dryRun: boolean) => reconcileCamt(file, dryRun),
}))

import PaymentReconciliationScreen from './PaymentReconciliationScreen'

function treffer(over: Partial<ReconcileResult> = {}): ReconcileResult {
  return {
    status: 'amount_mismatch',
    reference: 'RF18539007547034',
    paid_amount: 1180.0,
    currency: 'CHF',
    value_date: '2026-08-19',
    debtor_name: 'Muster AG',
    invoice_id: 42,
    invoice_number: 'R-2026-0042',
    project_name: 'Sanierung Bad',
    expected_amount: 1250.0,
    amount_diff: -70.0,
    ...over,
  }
}

function antwort(results: ReconcileResult[]): ReconcileResponse {
  return {
    status: 'ok',
    summary: {
      total: results.length, matched: 0, amount_mismatch: results.length,
      already_paid: 0, unmatched: 0, applied: 0, dry_run: true,
    },
    results,
  }
}

/** Datei wählen und Abgleich starten — ohne das gibt es kein Ergebnis. */
async function abgleichStarten(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, new File(['<xml/>'], 'auszug.xml', { type: 'text/xml' }))
  await user.click(screen.getByRole('button', { name: 'Vorschau erstellen' }))
}

beforeEach(() => {
  mobile = true
  reconcileCamt.mockReset().mockResolvedValue(antwort([treffer()]))
})

describe('PaymentReconciliationScreen — Karten auf dem Handy', () => {
  it('rendert Karten statt der 9-spaltigen Tabelle', async () => {
    const user = userEvent.setup()
    const { container } = render(<PaymentReconciliationScreen />)
    await abgleichStarten(user, container)

    await waitFor(() => expect(container.querySelectorAll('.admin-card')).toHaveLength(1))
    expect(container.querySelector('table')).toBeNull()
  })

  it('rendert am Desktop weiterhin die Tabelle', async () => {
    mobile = false
    const user = userEvent.setup()
    const { container } = render(<PaymentReconciliationScreen />)
    await abgleichStarten(user, container)

    await waitFor(() => expect(container.querySelector('table')).not.toBeNull())
    expect(container.querySelectorAll('.admin-card')).toHaveLength(0)
  })

  it('zeigt die fünf Kernwerte, die vier Detailwerte erst nach dem Aufklappen', async () => {
    const user = userEvent.setup()
    const { container } = render(<PaymentReconciliationScreen />)
    await abgleichStarten(user, container)
    await waitFor(() => expect(container.querySelector('.admin-card')).not.toBeNull())

    const card = within(container.querySelector('.admin-card') as HTMLElement)
    // Sichtbar: Referenz, Rechnung, Eingegangen, Differenz, Status.
    expect(card.getByText('RF18539007547034')).toBeTruthy()
    expect(card.getByText(/Rechnung R-2026-0042/)).toBeTruthy()
    expect(card.getByText("CHF 1'180.00")).toBeTruthy()
    expect(card.getByText("CHF -70.00")).toBeTruthy()
    expect(card.getByText('Betrag weicht ab')).toBeTruthy()
    // Hinter dem Aufklappen: Projekt, Erwartet, Valuta, Auftraggeber.
    expect(card.queryByText('Sanierung Bad')).toBeNull()
    expect(card.queryByText('Muster AG')).toBeNull()

    await user.click(container.querySelector('.admin-card') as HTMLElement)

    const offen = within(container.querySelector('.admin-card') as HTMLElement)
    expect(offen.getByText('Sanierung Bad')).toBeTruthy()
    expect(offen.getByText("CHF 1'250.00")).toBeTruthy()
    expect(offen.getByText('2026-08-19')).toBeTruthy()
    expect(offen.getByText('Muster AG')).toBeTruthy()
  })

  it('klappt nur die angetippte Karte auf, nicht alle', async () => {
    // Zwei feldgleiche Zeilen sind im Bankauszug moeglich (zwei Teilzahlungen
    // gleicher Hoehe auf dieselbe Referenz). Der Detailblock haengt an
    // `expanded === i`; ein Vergleich auf `expanded !== null` wuerde beide
    // oeffnen und den Unterschied unsichtbar machen.
    const user = userEvent.setup()
    reconcileCamt.mockResolvedValue(antwort([treffer(), treffer()]))
    const { container } = render(<PaymentReconciliationScreen />)
    await abgleichStarten(user, container)
    await waitFor(() => expect(container.querySelectorAll('.admin-card')).toHaveLength(2))

    const zweite = container.querySelectorAll('.admin-card')[1] as HTMLElement
    await user.click(zweite)

    const karten = container.querySelectorAll('.admin-card')
    expect(within(karten[0] as HTMLElement).queryByText('Auftraggeber')).toBeNull()
    expect(within(karten[1] as HTMLElement).getByText('Auftraggeber')).toBeTruthy()
  })

  it('blendet die Differenz aus, wenn der Betrag stimmt', async () => {
    const user = userEvent.setup()
    reconcileCamt.mockResolvedValue(antwort([
      treffer({ status: 'matched', amount_diff: null, expected_amount: 1180.0 }),
    ]))
    const { container } = render(<PaymentReconciliationScreen />)
    await abgleichStarten(user, container)
    await waitFor(() => expect(container.querySelector('.admin-card')).not.toBeNull())

    const card = within(container.querySelector('.admin-card') as HTMLElement)
    expect(card.getByText('Bezahlt')).toBeTruthy()
    expect(card.queryByText(/Differenz/)).toBeNull()
  })
})
