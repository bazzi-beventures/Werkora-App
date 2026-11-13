/**
 * «Lieferantenrechnungen» — docs/specs/lieferantenrechnung-bexio.md §8.1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KreditorDetail, KreditorSummary, KreditorZaehler } from '../../api/kreditoren'

const listKreditoren = vi.fn()
const getKreditor = vi.fn()
const kreditorVisieren = vi.fn()
const uploadKreditoren = vi.fn()
vi.mock('../../api/kreditoren', () => ({
  listKreditoren: (...a: unknown[]) => listKreditoren(...a),
  getKreditor: (id: string) => getKreditor(id),
  holeKreditorDatei: vi.fn().mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' })),
  uploadKreditoren: (...a: unknown[]) => uploadKreditoren(...a),
  kreditorVisieren: (...a: unknown[]) => kreditorVisieren(...a),
  patchKreditor: vi.fn(),
  kreditorErneutLesen: vi.fn(),
  kreditorZurVisierung: vi.fn(),
  kreditorVisumZuruecknehmen: vi.fn(),
  kreditorAblehnen: vi.fn(),
  kreditorVerwerfen: vi.fn(),
  searchKreditorenProjekte: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../api/admin/suppliers', () => ({
  listSuppliers: vi.fn().mockResolvedValue([{ id: 's1', name: 'Griesser AG', prefix: 'GRI' }]),
  createSupplier: vi.fn(),
}))

import KreditorenScreen from './KreditorenScreen'

const ZAEHLER: KreditorZaehler = { zu_pruefen: 1, zu_visieren: 2, zu_visieren_meine: 1, badge: 2 }

function summary(over: Partial<KreditorSummary> = {}): KreditorSummary {
  return {
    id: 'b1', status: 'zu_pruefen', source: 'upload',
    supplier_id: 's1', supplier_name: 'Griesser AG',
    bill_number: 'R-100', bill_date: '2026-11-01', due_date: null,
    currency: 'CHF', gross_total: 1081.5, is_credit_note: false,
    erfasst_am: '2026-11-02T08:00:00Z', erfasst_von_name: 'Bea Büro',
    lese_status: 'gelesen', lese_fehler: null,
    projekte: [{ project_id: 'p1', number: '2600515', name: 'Bad Muster', customer: 'Muster', locality: 'Chur' }],
    sperre: false, iban_status: 'bekannt',
    visiert_von_name: null, visiert_am: null, skonto_pct: null, skonto_until: null, meine: false,
    ...over,
  }
}

function detail(over: Partial<KreditorDetail> = {}): KreditorDetail {
  return {
    ...summary({ status: 'zu_visieren', meine: true }),
    supplier: null, supplier_name_beleg: null, supplier_uid_beleg: null,
    net_total: 1000, vat_total: 81.5,
    payment: { iban: 'CH4431999123000889012', reference_type: 'QRR', reference: null, amount: 1081.5, currency: 'CHF', creditor_name: null },
    payment_source: 'qr', file_name: 'r.pdf', mime_type: 'application/pdf', pages: 1,
    lines: [{ id: 'l1', pos: 1, text: 'Storen', quantity: null, net_amount: 1000, vat_rate: 8.1, account_no: '4000', project_id: 'p1', project: null, bucket: 'projekt' }],
    vorschlag: { supplier_id: null, supplier_quelle: null, supplier_neu: null, projekt_kandidaten: [], lieferscheine: [] },
    hinweise: [],
    aktionen: { bearbeiten: false, erneut_lesen: false, zur_visierung: false, visieren: true, visum_zuruecknehmen: false, ablehnen: true, verwerfen: false },
    visum_block: null, iban_bestaetigung_noetig: true, abgelehnt_grund: null,
    konten: [], mwst_saetze: [8.1],
    ...over,
  }
}

beforeEach(() => {
  listKreditoren.mockReset().mockResolvedValue({ bills: [summary()], zaehler: ZAEHLER })
  getKreditor.mockReset().mockResolvedValue(detail())
  kreditorVisieren.mockReset().mockResolvedValue(detail({ status: 'visiert' }))
  uploadKreditoren.mockReset()
})

describe('KreditorenScreen', () => {
  it('zeigt die Liste «Zu prüfen» mit Lieferant, Betrag und Projekt und meldet die Zähler', async () => {
    const onZaehler = vi.fn()
    render(<KreditorenScreen onZaehler={onZaehler} />)
    expect(await screen.findByText('Griesser AG')).toBeTruthy()
    expect(listKreditoren).toHaveBeenCalledWith('zu_pruefen', {})
    expect(screen.getByText(/^CHF 1.081\.50$/)).toBeTruthy()
    expect(screen.getByText('2600515 Bad Muster')).toBeTruthy()
    expect(onZaehler).toHaveBeenCalledWith(ZAEHLER)
  })

  it('«Zu visieren»: «Nur meine» ist vorgewählt, wenn es eigene gibt, und filtert', async () => {
    listKreditoren.mockImplementation(async (ansicht: string) => ansicht === 'zu_visieren'
      ? { bills: [summary({ id: 'm', supplier_name: 'Meine AG', meine: true }), summary({ id: 'f', supplier_name: 'Fremde AG' })], zaehler: ZAEHLER }
      : { bills: [], zaehler: ZAEHLER })
    const user = userEvent.setup()
    render(<KreditorenScreen />)
    await user.click(await screen.findByRole('button', { name: 'Zu visieren' }))
    expect(await screen.findByText('Meine AG')).toBeTruthy()
    expect(screen.queryByText('Fremde AG')).toBeNull()
    const schalter = screen.getByRole('checkbox', { name: /Nur meine/ })
    expect((schalter as HTMLInputElement).checked).toBe(true)
    await user.click(schalter)
    expect(screen.getByText('Fremde AG')).toBeTruthy()
  })

  it('Visum mit neuer IBAN verlangt die telefonische Bestätigung', async () => {
    const user = userEvent.setup()
    render(<KreditorenScreen />)
    await user.click(await screen.findByText('Griesser AG'))
    await user.click(await screen.findByRole('button', { name: 'Visieren' }))
    const dialog = screen.getByRole('dialog', { name: 'Rechnung visieren' })
    expect(within(dialog).getByText('Neue Zahlungsverbindung')).toBeTruthy()
    expect(within(dialog).getByText('CH4431999123000889012')).toBeTruthy()
    expect(within(dialog).getByText(/Telefonnummer aus dem Lieferantenstamm/)).toBeTruthy()
    const ok = within(dialog).getByRole('button', { name: 'Visieren' })
    expect((ok as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(ok)
    expect(kreditorVisieren).toHaveBeenCalledWith('b1', true)
    // Nach dem Visum zurück zur Liste.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByRole('button', { name: 'Zu prüfen' })).toBeTruthy()
  })

  it('ein gesperrtes Visum ist deaktiviert und sagt warum', async () => {
    getKreditor.mockResolvedValue(detail({ visum_block: 'Die eigene Erfassung visiert jemand anderes.' }))
    const user = userEvent.setup()
    render(<KreditorenScreen />)
    await user.click(await screen.findByText('Griesser AG'))
    const knopf = await screen.findByRole('button', { name: 'Visieren' })
    expect((knopf as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Die eigene Erfassung visiert jemand anderes.')).toBeTruthy()
  })

  it('zeigt Upload-Fehler mit Link auf die vorhandene Rechnung', async () => {
    uploadKreditoren.mockResolvedValue({
      bills: [],
      fehler: [{ datei: 'doppelt.pdf', grund: 'Diese Rechnung ist schon erfasst.', bill_id: 'b1' }],
    })
    const user = userEvent.setup()
    render(<KreditorenScreen />)
    await screen.findByText('Griesser AG')
    await user.upload(screen.getByTestId('kred-upload-input'), new File(['%PDF'], 'doppelt.pdf', { type: 'application/pdf' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('doppelt.pdf')).toBeTruthy()
    expect(within(alert).getByText(/schon erfasst/)).toBeTruthy()
    await user.click(within(alert).getByRole('button', { name: 'Vorhandene Rechnung öffnen' }))
    expect(getKreditor).toHaveBeenCalledWith('b1')
  })
})
