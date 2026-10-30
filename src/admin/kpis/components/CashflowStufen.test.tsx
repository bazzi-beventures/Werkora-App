import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CashflowStufen from './CashflowStufen'
import { chfKurz } from '../chfKurz'
import type { PipelineStufen } from '../pipelineAggregation'

const basis: PipelineStufen = {
  beimKunden: 3, beimKundenChf: 2_000_000,
  auftrag: 2, auftragChf: 1_000_000,
  fakturiertOffen: 1, fakturiertOffenChf: 500_000,
  bezahlt: 4, bezahltChf: 400_000,
  annahmequote: 0.5, entschieden: 20,
  beimKundenErwartetChf: 1_000_000,
  gesichertChf: 1_500_000,
  nochZuErwartenChf: 2_500_000,
}
const summen = { akzeptiert: { anzahl: 5, betrag: 1 }, versendet: { anzahl: 6, betrag: 2 } }

describe('CashflowStufen', () => {
  it('kürzt ab einer Million auf «Mio.»', () => {
    expect(chfKurz(1_550_000)).toMatch(/^CHF 1\.55 Mio\.$/)
    expect(chfKurz(0)).toBe('CHF 0')
  })

  it('nennt gesichert, gewichtete Offerten und das Total', () => {
    render(<CashflowStufen stufen={basis} {...summen} zeitraumEingeschraenkt={false} />)
    expect(screen.getByText(/sind beauftragt, aber noch nicht bezahlt/)).toHaveTextContent('CHF 1.50 Mio.')
    expect(screen.getByText(/Annahmequote von 50 %/)).toBeInTheDocument()
    expect(screen.getByText(/noch zu erwarten/)).toHaveTextContent('CHF 2.50 Mio.')
    expect(screen.queryByText(/«Alles» wählen/)).not.toBeInTheDocument()
  })

  it('ohne Quote keine Schätzung, dafür der Grund', () => {
    render(
      <CashflowStufen
        stufen={{ ...basis, annahmequote: null, entschieden: 3, beimKundenErwartetChf: null, nochZuErwartenChf: 1_500_000 }}
        {...summen}
        zeitraumEingeschraenkt
      />,
    )
    expect(screen.getByText(/lässt sich im Zeitraum noch nicht schätzen/)).toBeInTheDocument()
    expect(screen.queryByText(/Annahmequote von/)).not.toBeInTheDocument()
    expect(screen.getByText(/«Alles» wählen/)).toBeInTheDocument()
  })
})
