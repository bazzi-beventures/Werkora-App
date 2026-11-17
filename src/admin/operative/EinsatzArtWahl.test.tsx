// «Art des Einsatzes» mit Terminfarben (docs/specs/termin-farbkategorien.md §3.5):
// die Kategorien des Betriebs SIND die Arten interner Einsätze.
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TerminFarbe } from '../../api/admin/tenant'
import { EinsatzArtWahl } from './EinsatzArtWahl'
import type { FormState } from './scheduleScreenModel'

const FARBEN: TerminFarbe[] = [
  { key: 'buero', label: 'Büro', color: '#fdba74' },
  { key: 'schulung', label: 'Schulung', color: '#2563eb' },
]

const leer = (over: Partial<FormState> = {}): FormState => ({
  id: '', name: 'Sonstiges', kind: 'sonstiges', customerId: '', projektleiterId: '',
  monteurIds: [], bemerkung: '', ...over,
})

// Der Zustand steht im DOM, damit der Test ihn lesen kann, ohne eine Variable
// ausserhalb der Komponente zu beschreiben (react-hooks/globals).
const zustand = (): FormState => JSON.parse(screen.getByTestId('zustand').textContent || 'null')

function Harness({ start, farben = FARBEN, blocker = [] as string[], bisher }: {
  start: FormState; farben?: TerminFarbe[]; blocker?: string[]; bisher?: string | null
}) {
  const [form, setForm] = useState<FormState | null>(start)
  return form && <>
    <EinsatzArtWahl form={form} setForm={setForm} blockerCategories={blocker}
                    terminFarben={farben} farbeBisher={bisher} />
    <output data-testid="zustand">{JSON.stringify(form)}</output>
  </>
}

const optionen = () => screen.getAllByRole('option').map(o => o.textContent)

describe('EinsatzArtWahl', () => {
  it('mit Terminfarben: die Kategorien des Betriebs plus Blocker statt der festen Arten', () => {
    render(<Harness start={leer()} />)
    expect(optionen()).toEqual(['Büro', 'Schulung', 'Blocker (provisorisch)', 'Sonstiges'])
  })

  it('Kategorie wählen setzt Titel und Farbe in einem Zug', async () => {
    render(<Harness start={leer()} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Büro')
    expect(zustand()).toMatchObject({ kind: 'sonstiges', name: 'Büro', terminFarbe: 'buero' })
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Schulung')
    expect(zustand()).toMatchObject({ name: 'Schulung', terminFarbe: 'schulung' })
  })

  it('ein eigener Titel bleibt stehen', async () => {
    render(<Harness start={leer({ name: 'Kurs Storen Griesser' })} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Schulung')
    expect(zustand()).toMatchObject({ name: 'Kurs Storen Griesser', terminFarbe: 'schulung' })
  })

  it('bestehender Einsatz zeigt die Farbe seiner Termine als Art', () => {
    render(<Harness start={leer({ id: 'p1', name: 'Büro' })} bisher="buero" />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('tf:buero')
  })

  it('eine feste Werkora-Art eines alten Einsatzes bleibt als Eintrag stehen', () => {
    render(<Harness start={leer({ id: 'p1', kind: 'teamsitzung', name: 'Teamsitzung' })} />)
    expect(optionen()).toContain('Teamsitzung')
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('teamsitzung')
  })

  it('Blocker bleibt eigene Art, ohne Blocker-Kategorie neben den Farben', async () => {
    render(<Harness start={leer()} blocker={['Wartet auf Material']} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Blocker (provisorisch)')
    expect(zustand()).toMatchObject({ kind: 'blocker', terminFarbe: '' })
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('ohne Terminfarben: die festen Arten und die Blocker-Kategorie wie bisher', async () => {
    render(<Harness start={leer()} farben={[]} blocker={['Wartet auf Material']} />)
    expect(optionen()).toContain('Teamsitzung')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Blocker (provisorisch)')
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(zustand().terminFarbe).toBeUndefined()
  })
})
