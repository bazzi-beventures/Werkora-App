import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BexioTab } from './BexioTab'

// docs/specs/bexio-anbindung.md §8.1 — Reiter «bexio» der Betreiber-Seite.

const getBexio = vi.fn()
const setBexioToken = vi.fn()
const setBexioDefaults = vi.fn()
const listBexioJobs = vi.fn()
const startBexioOAuth = vi.fn()

vi.mock('../../tenantScopedApi', () => ({
  getBexio: () => getBexio(),
  setBexioToken: (...a: unknown[]) => setBexioToken(...a),
  setBexioDefaults: (...a: unknown[]) => setBexioDefaults(...a),
  listBexioJobs: () => listBexioJobs(),
  startBexioOAuth: () => startBexioOAuth(),
  testBexio: vi.fn(), deleteBexio: vi.fn(), retryBexioJob: vi.fn(),
  linkBexioContact: vi.fn(), cancelInBexio: vi.fn(), enqueueBexioInvoice: vi.fn(),
}))

const leer = {
  key_configured: true, module_enabled: false, connection: null, catalog: null,
  work_types: ['Neumontage', 'Reparatur'], readiness: ['Verbindung einrichten'], queue_counts: {},
}

const verbunden = {
  ...leer,
  readiness: [],
  connection: {
    auth_kind: 'api_token', secret_set: true, secret_set_at: '2026-10-31T10:00:00Z',
    secret_expires_at: '2026-12-30T10:00:00Z', bexio_company_name: 'Gehlhaar GmbH', bexio_user_id: 7,
    default_account_id: 300, account_by_work_type: { Neumontage: 300, Reparatur: 310 },
    default_tax_id: 28, default_tax_id_zero: 30, default_unit_id_hours: 2, default_unit_id_piece: 1,
    default_unit_id_flat: 5, default_bank_account_id: 4, payments_push: true, payments_pull: false,
    status: 'ok', last_ok_at: null, last_error: null,
  },
  catalog: {
    user_id: 7, company_id: 1, company_name: 'Gehlhaar GmbH', numbering_automatic: false,
    taxes: [{ id: 28, code: 'UN81', value: 8.1 }, { id: 30, code: 'UN0', value: 0 }],
    accounts: [
      { id: 300, account_no: '3000', name: 'Ertrag aus Neumontagen', is_active: true },
      { id: 310, account_no: '3100', name: 'Ertrag aus Reparaturen', is_active: true },
      { id: 391, account_no: '3901', name: 'Veränderung Garantieleistungen', is_active: true },
    ],
    units: [{ id: 1, name: 'Stk.' }, { id: 2, name: 'Std.' }, { id: 5, name: 'pauschal' }],
    banks: [{ id: 4, name: 'ZKB', iban: 'CH93', qr_iban: '' }],
  },
  findings: [],
}

beforeEach(() => {
  getBexio.mockReset().mockResolvedValue(leer)
  setBexioToken.mockReset().mockResolvedValue(verbunden)
  setBexioDefaults.mockReset().mockResolvedValue(verbunden)
  listBexioJobs.mockReset().mockResolvedValue([])
  startBexioOAuth.mockReset().mockResolvedValue({
    authorize_url: 'https://auth.bexio.com/realms/bexio/protocol/openid-connect/auth?state=abc', expires_in_minutes: 15,
  })
})

describe('BexioTab', () => {
  it('sagt ohne Schlüssel in der Umgebung, dass die Anbindung aus ist', async () => {
    getBexio.mockResolvedValue({ ...leer, key_configured: false })
    render(<BexioTab tenantId="t-1" />)
    expect(await screen.findByText(/BEXIO_TOKEN_KEY/)).toBeTruthy()
  })

  it('leert das Token-Feld nach dem Speichern und zeigt die Firma', async () => {
    render(<BexioTab tenantId="t-1" />)
    const feld = await screen.findByLabelText('Persönliches Token') as HTMLInputElement
    fireEvent.change(feld, { target: { value: 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjF9.sig' } })
    fireEvent.click(screen.getByText('Testen und speichern'))
    await waitFor(() => expect(setBexioToken).toHaveBeenCalledWith('t-1', 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjF9.sig', undefined))
    await waitFor(() => expect(feld.value).toBe(''))
    expect(screen.getAllByText('Gehlhaar GmbH').length).toBeGreaterThan(0)
  })

  it('«Mit bexio verbinden» zeigt den Link zum Öffnen oder Weitergeben', async () => {
    render(<BexioTab tenantId="t-1" />)
    fireEvent.click(await screen.findByText('Mit bexio verbinden'))
    expect(await screen.findByText(/auth\.bexio\.com/)).toBeTruthy()
    expect(screen.getByText('Öffnen').getAttribute('href')).toMatch(/^https:\/\/auth\.bexio\.com/)
  })

  it('die Zahlungsrichtung ist eine Wahl, nicht zwei Häkchen', async () => {
    getBexio.mockResolvedValue(verbunden)
    render(<BexioTab tenantId="t-1" />)
    fireEvent.click(await screen.findByLabelText(/Aus bexio holen/))
    fireEvent.click(screen.getByText('Einstellungen speichern'))
    await waitFor(() => expect(setBexioDefaults).toHaveBeenCalled())
    expect(setBexioDefaults.mock.calls[0][1]).toMatchObject({ payments_push: false, payments_pull: true })
  })

  it('zeigt die Kontierung je Leistungsart ohne Abschlusskonten', async () => {
    getBexio.mockResolvedValue(verbunden)
    render(<BexioTab tenantId="t-1" />)
    const rep = await screen.findByLabelText('Ertragskonto Reparatur') as HTMLSelectElement
    expect(rep.value).toBe('310')
    const optionen = Array.from(rep.options).map(o => o.textContent)
    expect(optionen).toContain('3100 Ertrag aus Reparaturen')
    expect(optionen.some(t => t?.startsWith('3901'))).toBe(false)

    fireEvent.change(rep, { target: { value: '' } })
    fireEvent.click(screen.getByText('Einstellungen speichern'))
    await waitFor(() => expect(setBexioDefaults).toHaveBeenCalled())
    expect(setBexioDefaults.mock.calls[0][1].account_by_work_type).toEqual({ Neumontage: 300 })
  })
})
