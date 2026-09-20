/**
 * Die Rechnungsliste des Betreibers — wen sie zeigt und wann etwas verspätet ist.
 *
 * Spec: docs/specs/admin-werkora-ch.md §8.3.
 *
 * Der Screen beantwortet eine andere Frage als die Rechnungsliste der
 * Mandanten-App: Dort ist eine Rechnung der Abschluss eines Projekts, hier geht
 * sie an einen Mandanten. Geprüft wird deshalb nicht das Aussehen, sondern
 * **was in der Zeile steht** und **welcher Reiter sie fängt**.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Invoice } from '../../api/admin/invoices'

const listInvoices = vi.fn()
vi.mock('../../api/admin/invoices', () => ({
  listInvoices: () => listInvoices(),
  archiveInvoice: vi.fn(),
  markInvoicePaid: vi.fn(),
  markInvoiceSentByPost: vi.fn(),
  sendInvoice: vi.fn(),
  unmarkInvoicePaid: vi.fn(),
}))
vi.mock('../../api/admin/customers', () => ({ getAllCustomers: () => Promise.resolve([]) }))
vi.mock('../../admin/operative/FreeInvoiceDialog', () => ({
  default: () => <div>FREIE-RECHNUNG-DIALOG</div>,
}))

import OperatorInvoicesScreen from './OperatorInvoicesScreen'
import { anzeigeStatus, istVerspaetet, passtZuReiter } from './operatorInvoiceStatus'

const HEUTE = '2026-09-18'

function rechnung(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 1, invoice_number: '2026-008', project_name: 'Gehlhaar GmbH',
    total_amount: 70, status: 'offen', created_at: '2026-08-31T10:00:00Z',
    paid_at: null, projektleiter_id: null, project_id: null,
    remark: 'KI App für Gehlhaar', due_date: null, ...over,
  }
}

// ── Die Frist ────────────────────────────────────────────────────────────────

describe('istVerspaetet', () => {
  it('ist ohne Frist nie verspätet — die Rechnung ist noch nicht raus', () => {
    expect(istVerspaetet(rechnung({ due_date: null }), HEUTE)).toBe(false)
  })

  it('greift, wenn die Frist überschritten ist', () => {
    expect(istVerspaetet(rechnung({ due_date: '2026-09-17', status: 'gesendet' }), HEUTE)).toBe(true)
  })

  it('gilt am Fälligkeitstag selbst noch nicht', () => {
    // Zahlbar BIS zu diesem Tag — wer heute zahlt, ist pünktlich.
    expect(istVerspaetet(rechnung({ due_date: HEUTE, status: 'gesendet' }), HEUTE)).toBe(false)
  })

  it('eine bezahlte Rechnung ist nie verspätet, auch mit alter Frist', () => {
    const bezahlt = rechnung({ due_date: '2026-01-01', status: 'bezahlt', paid_at: '2026-01-05' })
    expect(istVerspaetet(bezahlt, HEUTE)).toBe(false)
  })
})

describe('anzeigeStatus', () => {
  it('«Verspätet» schlägt den rohen Status', () => {
    const inv = rechnung({ due_date: '2026-09-01', status: 'gesendet' })
    expect(anzeigeStatus(inv, HEUTE).label).toBe('Verspätet')
  })

  it('führt die vier Zustände der Flask-App', () => {
    expect(anzeigeStatus(rechnung({ status: 'offen' }), HEUTE).label).toBe('Offen')
    expect(anzeigeStatus(rechnung({ status: 'gesendet' }), HEUTE).label).toBe('Gesendet')
    expect(anzeigeStatus(rechnung({ status: 'bezahlt' }), HEUTE).label).toBe('Bezahlt')
    expect(anzeigeStatus(rechnung({ status: 'archiviert' }), HEUTE).label).toBe('Archiviert')
  })
})

describe('passtZuReiter', () => {
  const offen = rechnung({ status: 'offen' })
  const spaet = rechnung({ status: 'gesendet', due_date: '2026-09-01' })

  it('«Alle» lässt Archiviertes aussen vor — sonst wäre «Alle» der Papierkorb', () => {
    expect(passtZuReiter(rechnung({ status: 'archiviert' }), 'alle', HEUTE)).toBe(false)
    expect(passtZuReiter(offen, 'alle', HEUTE)).toBe(true)
  })

  it('«Offen» und «Verspätet» überschneiden sich nicht', () => {
    expect(passtZuReiter(offen, 'offen', HEUTE)).toBe(true)
    expect(passtZuReiter(offen, 'verspaetet', HEUTE)).toBe(false)
    expect(passtZuReiter(spaet, 'verspaetet', HEUTE)).toBe(true)
    expect(passtZuReiter(spaet, 'offen', HEUTE)).toBe(false)
  })
})

// ── Der Bildschirm ───────────────────────────────────────────────────────────

describe('OperatorInvoicesScreen', () => {
  it('zeigt Empfänger und Beschreibung statt eines Projekts', async () => {
    listInvoices.mockResolvedValue([rechnung()])
    render(<OperatorInvoicesScreen />)

    const kopf = await screen.findByRole('table')
    expect(within(kopf).getByText('Empfänger')).toBeTruthy()
    expect(within(kopf).getByText('Beschreibung')).toBeTruthy()
    // Die Spalte «Projekt» der Mandanten-Liste gibt es hier nicht.
    expect(within(kopf).queryByText('Projekt')).toBeNull()
    expect(within(kopf).getByText('Gehlhaar GmbH')).toBeTruthy()
    expect(within(kopf).getByText('KI App für Gehlhaar')).toBeTruthy()
  })

  it('«+ Rechnung erstellen» öffnet die freie Rechnung, nicht den Projekt-Weg', async () => {
    listInvoices.mockResolvedValue([])
    render(<OperatorInvoicesScreen />)
    await waitFor(() => expect(listInvoices).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: '+ Rechnung erstellen' }))

    expect(screen.getByText('FREIE-RECHNUNG-DIALOG')).toBeTruthy()
  })

  it('der Reiter «Verspätet» zeigt nur überfällige', async () => {
    listInvoices.mockResolvedValue([
      rechnung({ id: 1, invoice_number: '2026-008', status: 'offen' }),
      rechnung({ id: 2, invoice_number: '2026-007', status: 'gesendet', due_date: '2026-01-01' }),
    ])
    render(<OperatorInvoicesScreen />)
    await screen.findByText('2026-008')

    await userEvent.click(screen.getByRole('button', { name: /^Verspätet/ }))

    expect(screen.getByText('2026-007')).toBeTruthy()
    expect(screen.queryByText('2026-008')).toBeNull()
  })
})
