import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FerienVorpruefung } from './FerienVorpruefung'

// Vorprüfung im Ferienantrag (docs/specs/ferienplanung.md §7.2): rot sperrt das
// Absenden, im Betatest (wirkt = false) erscheint nichts.

const getMeinKalender = vi.fn()
const vorpruefen = vi.fn()
vi.mock('../../api/ferienplanungPwa', () => ({
  getMeinKalender: (j: number) => getMeinKalender(j),
  vorpruefen: (p: unknown) => vorpruefen(p),
}))

const KALENDER = {
  wirkt: true, kanton: 'ZH', zwei_wochen: 'fehlt', feiertage: [],
  sperrfristen: [{ titel: 'Hochsaison', art: 'sperre', haerte: 'hart', von: '2027-07-01', bis: '2027-07-31' }],
}

beforeEach(() => {
  getMeinKalender.mockReset().mockResolvedValue(KALENDER)
  vorpruefen.mockReset()
})

describe('FerienVorpruefung', () => {
  it('harter Befund: Meldung und Sperre', async () => {
    vorpruefen.mockResolvedValue({ wirkt: true, befunde: [{ titel: 'Hochsaison', haerte: 'hart' }],
      meldung: 'In dieser Zeit nicht möglich: Sperrfrist «Hochsaison».' })
    const onSperre = vi.fn()
    render(<FerienVorpruefung absenceType="vacation" dateStart="2027-07-12" dateEnd="2027-07-16" onSperre={onSperre} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sperrfrist «Hochsaison»')
    await waitFor(() => expect(onSperre).toHaveBeenLastCalledWith(true))
    expect(screen.getByText(/Gesperrte Zeiten 2027/)).toHaveTextContent('Hochsaison 01.07.–31.07.')
    expect(screen.getByText(/noch keine zwei Wochen/)).toBeTruthy()
  })

  it('ohne Befund grün', async () => {
    vorpruefen.mockResolvedValue({ wirkt: true, befunde: [] })
    const onSperre = vi.fn()
    render(<FerienVorpruefung absenceType="vacation" dateStart="2027-08-02" dateEnd="2027-08-06" onSperre={onSperre} />)
    expect(await screen.findByText(/Passt/)).toBeTruthy()
    expect(onSperre).toHaveBeenLastCalledWith(false)
  })

  it('im Betatest nichts', async () => {
    getMeinKalender.mockResolvedValue({ ...KALENDER, wirkt: false })
    const { container } = render(
      <FerienVorpruefung absenceType="vacation" dateStart="2027-07-12" dateEnd="2027-07-16" onSperre={vi.fn()} />)
    await waitFor(() => expect(getMeinKalender).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    expect(vorpruefen).not.toHaveBeenCalled()
  })
})
