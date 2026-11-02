// Diagramm im Assistent-Chat (Spec §8 Phase 5).
//
// Wie in chartSeries.test.tsx wird recharts ersetzt: ResponsiveContainer misst
// in jsdom Breite 0 und zeichnet gar nichts — ein Test gegen das leere SVG wäre
// still grün. Geprüft wird, was an <Bar> ankommt (Reihe, Farbe), dazu der Text
// drumherum: Titel, Hinweise, Tabelle.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KpiDiagramm } from '../../../api/admin/kpiAssistent'

const balken: { dataKey: string; name?: string; fill?: string }[] = []

vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => <div data-testid="legende" />,
    ReferenceLine: () => <div data-testid="nulllinie" />,
    LabelList: () => null,
    Bar: ({ dataKey, name, fill }: { dataKey: string; name?: string; fill?: string }) => {
      balken.push({ dataKey, name, fill })
      return null
    },
  }
})

const { default: AssistentDiagramm } = await import('./AssistentDiagramm')

const MONATE: KpiDiagramm = {
  art: 'umsatz_gewinn_monate', form: 'saeulen',
  titel: 'Umsatz und Gewinn je Monat', untertitel: 'Okt 2026 – Nov 2026 · gestellt',
  einheit: 'CHF',
  kategorien: ['Okt 26', 'Nov 26'],
  reihen: [
    { name: 'Umsatz', rolle: 'haupt', werte: [41200, 0] },
    { name: 'Gewinn', rolle: 'haupt', werte: [-300, null] },
  ],
  zusatz: null,
  hinweise: ['November 2026 läuft noch – seine Zahlen sind unvollständig.'],
  reiter: { id: 'finanzen', label: 'Finanzen' },
}

beforeEach(() => { balken.length = 0 })

describe('AssistentDiagramm', () => {
  it('zeichnet jede Reihe mit eigener Palettenfarbe, Legende und Nulllinie', () => {
    render(<AssistentDiagramm diagramm={MONATE} />)
    expect(screen.getByText('Umsatz und Gewinn je Monat')).toBeTruthy()
    expect(screen.getByText('Okt 2026 – Nov 2026 · gestellt')).toBeTruthy()
    const letzte = balken.slice(-2)
    expect(letzte.map(b => [b.dataKey, b.name])).toEqual([['r0', 'Umsatz'], ['r1', 'Gewinn']])
    for (const b of letzte) expect(b.fill).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    expect(new Set(letzte.map(b => b.fill)).size).toBe(2)
    expect(screen.getByTestId('legende')).toBeTruthy()
    expect(screen.getByTestId('nulllinie')).toBeTruthy()
  })

  it('zeigt die Hinweise und die Werte als Tabelle, Lücken als Strich', () => {
    render(<AssistentDiagramm diagramm={MONATE} />)
    expect(screen.getByText(/November 2026 läuft noch/)).toBeTruthy()
    fireEvent.click(screen.getByText('Werte als Tabelle'))
    const zeile = screen.getByText('Nov 26').closest('tr')!
    expect(zeile.textContent).toContain('CHF 0')
    expect(zeile.textContent).toContain('–')
    expect(screen.getByText('Okt 26').closest('tr')!.textContent).toMatch(/CHF 41.200/)
  })

  it('Rangbalken: eine Reihe, keine Legende, Zusatz in der Tabelle', () => {
    render(<AssistentDiagramm diagramm={{
      ...MONATE, art: 'top_kunden', form: 'balken', titel: 'Top 2 Kunden nach Umsatz gestellt',
      kategorien: ['Muster AG', 'Klein GmbH'], zusatz: ['3 Projekte', '1 Projekt'], hinweise: [],
      reihen: [{ name: 'Umsatz gestellt', rolle: 'haupt', werte: [50000, 1000] }],
    }} />)
    expect(balken[balken.length - 1]).toMatchObject({ dataKey: 'r0', name: 'Umsatz gestellt' })
    expect(screen.queryByTestId('legende')).toBeNull()
    expect(screen.getByText('3 Projekte')).toBeTruthy()
  })

  it('Vorjahr als graue Kontextreihe, das laufende Jahr in Palettenfarbe', () => {
    render(<AssistentDiagramm diagramm={{
      ...MONATE, art: 'vorjahresvergleich', hinweise: [],
      reihen: [
        { name: 'Okt 24 – Nov 25', rolle: 'kontext', werte: [1, 2] },
        { name: 'Okt 25 – Nov 26', rolle: 'haupt', werte: [3, 4] },
      ],
    }} />)
    const [vorjahr, aktuell] = balken.slice(-2)
    expect(vorjahr.fill).not.toBe(aktuell.fill)
    // Die Hauptreihe bekommt Slot 1 der Palette, auch hinter der Kontextreihe.
    balken.length = 0
    render(<AssistentDiagramm diagramm={{ ...MONATE, reihen: [MONATE.reihen[0]] }} />)
    expect(aktuell.fill).toBe(balken[balken.length - 1].fill)
  })
})
