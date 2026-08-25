import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import type { WerkoraBonusResponse } from '../../api/admin/werkoraBonus'

// Recharts in jsdom vermeiden (misst 0-Grösse, verrauscht die Tests).
vi.mock('../kpis/components/BiBarChart', () => ({ default: () => null }))

const getWerkoraBonus = vi.fn()
vi.mock('../../api/admin/werkoraBonus', () => ({
  getWerkoraBonus: (von: string, bis: string) => getWerkoraBonus(von, bis),
}))

import WerkoraBonusScreen from './WerkoraBonusScreen'

const LEER: WerkoraBonusResponse = {
  von: '2026-06-01', bis: '2026-08-23', aktiv: true,
  konfiguration: {
    schwelle_chf: 1000, raster_chf: 100, ziel_von: 85, ziel_bis: 95,
    position_label: 'Bearbeitungspauschale',
  },
  kennzahlen: {
    realisiert: 0, bezahlt: 0, offeriert_offen: 0, belege_mit_bonus: 0,
    durchschnitt_pro_beleg: null, trefferquote_pct: null,
    anteil_netto_umsatz_pct: null, netto_umsatz: 0,
  },
  monate: [],
  belege: [],
}

const GEFUELLT: WerkoraBonusResponse = {
  ...LEER,
  kennzahlen: {
    realisiert: 1284.5, bezahlt: 910.25, offeriert_offen: 340, belege_mit_bonus: 17,
    durchschnitt_pro_beleg: 75.56, trefferquote_pct: 62.5,
    anteil_netto_umsatz_pct: 1.4, netto_umsatz: 91750,
  },
  monate: [{ monat: '2026-08', offeriert: 340, realisiert: 1284.5 }],
  belege: [
    {
      art: 'offerte', nummer: 'OFF-2026-042', datum: '2026-08-05',
      kunde: 'Huber GmbH', projekt: 'Umbau Bad',
      basis_brutto: 5405, bonus: 80, end_brutto: 5485, status: 'offen',
    },
  ],
}

function setup(data: WerkoraBonusResponse = GEFUELLT) {
  getWerkoraBonus.mockResolvedValue(data)
  return render(<WerkoraBonusScreen />)
}

beforeEach(() => {
  getWerkoraBonus.mockReset()
})

describe('WerkoraBonusScreen', () => {
  it('zeigt bei leerem Datensatz "—" statt 0 oder NaN', async () => {
    setup(LEER)
    // Ø pro Beleg, Trefferquote und Anteil haben ohne Belege keine Bezugsgrösse.
    // Eine 0 behauptete eine gemessene Null — das UI muss "—" zeigen.
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3))
    expect(screen.queryByText(/NaN/)).toBeNull()
    expect(screen.getByText(/Kein Beleg im Zeitraum/)).toBeInTheDocument()
  })

  it('zeigt die Kennzahlen und die Belegtabelle', async () => {
    setup()
    await waitFor(() => expect(screen.getByText(/CHF 1’284.50|CHF 1'284.50/)).toBeInTheDocument())
    expect(screen.getByText('62.5 %')).toBeInTheDocument()

    const zeile = (await screen.findByText('OFF-2026-042')).closest('tr')!
    // Der eigentliche Zweck des Dashboards: 5'405 + 80 = 5'485 nachvollziehbar
    // nebeneinander — "warum steht auf dieser Offerte 5'485?"
    expect(within(zeile).getByText('80.00')).toBeInTheDocument()
    expect(within(zeile).getByText(/5.405.00/)).toBeInTheDocument()
    expect(within(zeile).getByText(/5.485.00/)).toBeInTheDocument()
    expect(within(zeile).getByText('05.08.2026')).toBeInTheDocument()
  })

  it('nennt die Beschriftung, die auf dem Kundendokument steht', async () => {
    setup()
    // "Werkora Bonus" ist ein interner Name und darf nie auf einem Beleg landen —
    // der Screen muss zeigen, was der Kunde tatsächlich liest.
    await waitFor(() => expect(screen.getByText(/«Bearbeitungspauschale»/)).toBeInTheDocument())
  })

  it('weist auf ein abgeschaltetes Feature hin, statt die Zahlen kommentarlos zu zeigen', async () => {
    setup({ ...GEFUELLT, aktiv: false })
    await waitFor(() => expect(screen.getByText(/nicht aktiv/)).toBeInTheDocument())
  })

  it('meldet einen Ladefehler statt einer leeren Seite', async () => {
    getWerkoraBonus.mockRejectedValue(new Error('Netzwerkfehler'))
    render(<WerkoraBonusScreen />)
    await waitFor(() => expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument())
  })
})
