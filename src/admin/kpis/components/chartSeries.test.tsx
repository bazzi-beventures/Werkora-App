// Sichert die Slot-Vergabe der Serienpalette ab (Design-Tokens 05).
//
// Der Punkt: Recharts nimmt in `fill` keine CSS-Variablen an. Die Farben
// muessen deshalb ueber useChartTheme zu konkreten Werten aufgeloest sein,
// bevor sie am Chart ankommen — ein durchgereichtes `var(--chart-1)` waere
// still wirkungslos, das Chart bliebe ungefaerbt und niemand merkte es.
//
// Geprueft wird, was bei <Bar fill> ankommt, nicht das fertige SVG:
// Recharts' ResponsiveContainer misst seinen Elternknoten und rendert in
// jsdom (Breite 0) gar keine Balken — ein Test gegen das leere SVG waere
// still gruen, ohne je eine Farbe gesehen zu haben.
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const balkenFills: string[] = []

vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    Bar: ({ fill }: { fill?: string }) => {
      balkenFills.push(fill ?? '')
      return null
    },
  }
})

const { default: BiBarChart } = await import('./BiBarChart')
const { useChartTheme } = await import('./useChartTheme')

const DATEN = [
  { monat: '2026-01', a: 10, b: 20, c: 30 },
  { monat: '2026-02', a: 15, b: 25, c: 35 },
]

function Probe() {
  const t = useChartTheme()
  return <span data-testid="serien">{t.series.join(',')}</span>
}

describe('Serienpalette', () => {
  it('liefert acht verschiedene, aufgeloeste Farben in fester Reihenfolge', () => {
    const { getByTestId } = render(<Probe />)
    const serien = getByTestId('serien').textContent!.split(',')

    expect(serien).toHaveLength(8)
    expect(new Set(serien).size).toBe(8)
    // In jsdom loest getComputedStyle die Variablen nicht auf, dann greift der
    // Fallback im Hook. So oder so muessen es echte Farbwerte sein.
    for (const c of serien) expect(c).toMatch(/^#[0-9a-fA-F]{3,8}$/)
  })

  it('faerbt Balken ohne color-Angabe der Reihe nach aus der Palette', () => {
    balkenFills.length = 0
    render(
      <BiBarChart
        data={DATEN}
        xKey="monat"
        bars={[
          { dataKey: 'a', label: 'A' },
          { dataKey: 'b', label: 'B' },
          { dataKey: 'c', label: 'C' },
        ]}
      />,
    )

    // useChartTheme liest das Theme im Effect nach und rendert ein zweites Mal;
    // massgeblich ist der letzte Durchlauf.
    const fills = balkenFills.slice(-3)
    expect(fills).toHaveLength(3)
    for (const f of fills) {
      expect(f).not.toContain('var(')
      expect(f).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }
    // Drei Serien, drei verschiedene Farben — nicht dreimal dieselbe.
    expect(new Set(fills).size).toBe(3)
  })

  it('laesst eine ausdruecklich gesetzte Farbe gewinnen', () => {
    balkenFills.length = 0
    render(
      <BiBarChart
        data={DATEN}
        xKey="monat"
        bars={[
          { dataKey: 'a', label: 'A', color: '#123456' },
          { dataKey: 'b', label: 'B' },
        ]}
      />,
    )

    const fills = balkenFills.slice(-2)
    expect(fills[0]).toBe('#123456')
    // Die zweite Serie bekommt weiterhin ihren Slot, nicht die gesetzte Farbe.
    expect(fills[1]).not.toBe('#123456')
    expect(fills[1]).toMatch(/^#[0-9a-fA-F]{3,8}$/)
  })
})
