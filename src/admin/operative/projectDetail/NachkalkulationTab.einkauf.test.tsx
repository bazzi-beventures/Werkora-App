/**
 * Block «Lieferantenrechnungen (effektiv)» in der Nachkalkulation —
 * docs/specs/lieferantenrechnung-bexio.md §8.4.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApiError } from '../../../api/client'

const fetchKpiView = vi.fn()
const getProjektEinkauf = vi.fn()
vi.mock('../../../api/kpiViews', () => ({ fetchKpiView: (...a: unknown[]) => fetchKpiView(...a) }))
vi.mock('../../../api/kreditoren', () => ({ getProjektEinkauf: (id: string) => getProjektEinkauf(id) }))

import { NachkalkulationTab } from './NachkalkulationTab'

const ROW = {
  projekt_id: 'p1', total_materialkosten_intern: 8420,
  lohn_ohne_satz: 0, material_ohne_preis: 0, lohn_intern_ohne_satz: 0, material_ohne_ek: 0, material_ek_geschaetzt: 0,
}

beforeEach(() => {
  fetchKpiView.mockReset().mockResolvedValue([ROW])
  getProjektEinkauf.mockReset()
})

describe('Nachkalkulation — Lieferantenrechnungen', () => {
  it('ohne Modul wird nichts geladen', async () => {
    render(<NachkalkulationTab projectId="p1" />)
    expect(await screen.findByText('Eigenkosten')).toBeTruthy()
    expect(getProjektEinkauf).not.toHaveBeenCalled()
    expect(screen.queryByText('Lieferantenrechnungen (effektiv)')).toBeNull()
  })

  it('effektiv gegen geplant mit Abweichung, offene als Hinweis', async () => {
    getProjektEinkauf.mockResolvedValue({ rechnungen: 2, offen: 1, material: 8910, fremdleistung: 1200, uebrige: 0, total: 10110 })
    render(<NachkalkulationTab projectId="p1" kreditoren />)
    expect(await screen.findByText(/^\+CHF 490\.00 \(\+5[.,]8 %\)$/)).toBeTruthy()
    expect(screen.getByText('Lieferantenrechnungen (effektiv)')).toBeTruthy()
    expect(screen.getByText('1 Rechnung(en) noch nicht visiert — zählen noch nicht')).toBeTruthy()
  })

  it('«Noch keine Lieferantenrechnung» statt 0', async () => {
    getProjektEinkauf.mockResolvedValue({ rechnungen: 0, offen: 0, material: null, fremdleistung: null, uebrige: null, total: null })
    render(<NachkalkulationTab projectId="p1" kreditoren />)
    expect(await screen.findByText('Noch keine Lieferantenrechnung')).toBeTruthy()
  })

  it('403 lässt den Block still weg', async () => {
    getProjektEinkauf.mockRejectedValue(new ApiError(403, 'Kein Zugriff'))
    render(<NachkalkulationTab projectId="p1" kreditoren />)
    expect(await screen.findByText('Eigenkosten')).toBeTruthy()
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByText('Lieferantenrechnungen (effektiv)')).toBeNull()
  })
})
