import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ServiceBegleitungTab } from './ServiceBegleitungTab'

// docs/specs/servicebegleitung.md §4.3 — Reiter «Servicebegleitung» der Betreiber-Seite.

const getServiceBegleitung = vi.fn()
const setServiceBegleitung = vi.fn()

vi.mock('../../tenantScopedApi', () => ({
  getServiceBegleitung: (...a: unknown[]) => getServiceBegleitung(...a),
  setServiceBegleitung: (...a: unknown[]) => setServiceBegleitung(...a),
}))

const katalog = [{
  key: 'unterwegs_meldung', label: 'Unterwegs-Meldung', description: 'Der Monteur tippt «Unterwegs».',
  kundenwirksam: true, hinweis_kunde: 'Ihre Kunden erhalten ab jetzt eine Mail.',
  default: { enabled: false, puffer_min: 5 },
  schema: [
    { key: 'enabled', label: 'Aktiv', type: 'bool' },
    { key: 'puffer_min', label: 'Puffer auf die Fahrzeit (Minuten)', type: 'number', min: 0, max: 30, step: 5 },
  ],
}]

const view = {
  katalog,
  werkzeuge: { unterwegs_meldung: { enabled: false, puffer_min: 5 } },
  depot: { adresse: '', lat: null, lon: null },
  modul_aktiv: false,
  info_mitarbeitende: 'Es wird kein Standort erhoben.',
  updated_at: null, updated_by: null,
}

beforeEach(() => {
  getServiceBegleitung.mockReset().mockResolvedValue(view)
  setServiceBegleitung.mockReset().mockImplementation((_t: string, e: { werkzeuge: unknown; depot: { adresse: string } }) =>
    Promise.resolve({ ...view, werkzeuge: e.werkzeuge, depot: { adresse: e.depot.adresse, lat: 47.5, lon: 8.7 } }))
})

describe('ServiceBegleitungTab', () => {
  it('zeigt Katalog, Stand und die Vorlage für die Mitarbeitenden', async () => {
    render(<ServiceBegleitungTab tenantId="t-1" />)
    expect(await screen.findByText('Unterwegs-Meldung')).toBeInTheDocument()
    expect(getServiceBegleitung).toHaveBeenCalledWith('t-1')
    expect(screen.getByText('Modul aus — kein Werkzeug wirkt')).toBeInTheDocument()
    expect(screen.getByText('Es wird kein Standort erhoben.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('warnt beim Einschalten eines kundenwirksamen Werkzeugs und speichert', async () => {
    render(<ServiceBegleitungTab tenantId="t-1" />)
    fireEvent.click(await screen.findByLabelText('Aktiv'))
    expect(screen.getByText('Ihre Kunden erhalten ab jetzt eine Mail.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Depot-Adresse'), { target: { value: 'Werkstrasse 1, 8400 Winterthur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(setServiceBegleitung).toHaveBeenCalledWith('t-1', {
      werkzeuge: { unterwegs_meldung: { enabled: true, puffer_min: 5 } },
      depot: { adresse: 'Werkstrasse 1, 8400 Winterthur' },
    }))
  })
})
