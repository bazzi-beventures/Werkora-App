import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColumnFilter, activeSectionCount, clearedValues } from './ColumnFilter'
import type { FilterSection, FilterValues } from './ColumnFilter'

// Spec: docs/specs/projektliste-filter-sortierung.md §3.1, §3.2a, §7.

const STATUS_SECTIONS: FilterSection[] = [{
  kind: 'multi', key: 'invoiceStatus',
  options: [
    { value: 'gesendet', label: 'Gesendet' },
    { value: 'bezahlt', label: 'Bezahlt' },
    { value: 'none', label: 'Keine Rechnung' },
  ],
}]

const KUNDE_SECTIONS: FilterSection[] = [
  { kind: 'multi', key: 'locality', title: 'Ortschaft', options: [{ value: 'Winterthur', label: 'Winterthur', badge: 312 }] },
  { kind: 'text', key: 'address', title: 'Adresse enthält' },
  { kind: 'text', key: 'phone', title: 'Telefon enthält' },
]

const LEER: FilterValues = { invoiceStatus: [], locality: [], address: '', phone: '', created: { from: '', to: '' } }

function oeffne(label = 'Rechnung', sections = STATUS_SECTIONS, values = LEER, onChange = vi.fn()) {
  render(<ColumnFilter label={label} sections={sections} values={values} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: `Filter: ${label}` }))
  return onChange
}

describe('ColumnFilter', () => {
  it('der Klick auf den Trichter sortiert nicht mit', () => {
    // Beschriftung sortiert, Trichter filtert — ohne stopPropagation wuerde jedes
    // Oeffnen des Filters die Liste umsortieren.
    const sortieren = vi.fn()
    render(
      <table><thead><tr>
        <th onClick={sortieren}>
          Rechnung
          <ColumnFilter label="Rechnung" sections={STATUS_SECTIONS} values={LEER} onChange={vi.fn()} />
        </th>
      </tr></thead></table>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Rechnung' }))
    expect(sortieren).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Filter: Rechnung' })).toBeTruthy()
  })

  it('auch ein Haekchen im Popup sortiert nicht mit', () => {
    // React leitet Ereignisse aus einem Portal am React-Baum entlang weiter, nicht
    // am DOM-Baum: ohne stopPropagation am Panel landet jeder Klick im Popup beim
    // onClick des Spaltenkopfs — und das Umsortieren rendert das Popup gleich weg.
    const sortieren = vi.fn()
    render(
      <table><thead><tr>
        <th onClick={sortieren}>
          Rechnung
          <ColumnFilter label="Rechnung" sections={STATUS_SECTIONS} values={LEER} onChange={vi.fn()} />
        </th>
      </tr></thead></table>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Rechnung' }))
    fireEvent.click(screen.getByLabelText('Bezahlt'))
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(sortieren).not.toHaveBeenCalled()
  })

  it('uebernimmt die Auswahl erst auf Knopfdruck', () => {
    const onChange = oeffne()
    fireEvent.click(screen.getByLabelText('Keine Rechnung'))
    // Noch nichts uebernommen: sonst laedt die Liste bei jedem Haekchen neu.
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ invoiceStatus: ['none'] }))
  })

  it('schliesst das Popup nach dem Übernehmen', () => {
    oeffne()
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape schliesst ohne zu uebernehmen', () => {
    const onChange = oeffne()
    fireEvent.click(screen.getByLabelText('Bezahlt'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('"Alle" und "Keine" fuellen und leeren die Auswahl', () => {
    const onChange = oeffne()
    fireEvent.click(screen.getByRole('button', { name: 'Alle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      invoiceStatus: ['gesendet', 'bezahlt', 'none'],
    }))
  })

  it('zeigt die Trefferzahl hinter dem Wert', () => {
    // "Zuerich (204)" neben "Zurich (2)" macht die Dublette im Adressstamm
    // sichtbar — der Grund, warum ein Filter mal nichts findet.
    oeffne('Kunde', KUNDE_SECTIONS)
    expect(screen.getByText('312')).toBeTruthy()
  })

  it('traegt mehrere Abschnitte in einem Popup', () => {
    const onChange = oeffne('Kunde', KUNDE_SECTIONS)
    fireEvent.click(screen.getByLabelText(/Winterthur/))
    fireEvent.change(screen.getByLabelText('Telefon enthält'), { target: { value: '079 123 45 67' } })
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      locality: ['Winterthur'],
      phone: '079 123 45 67',
    }))
  })

  it('faerbt den Trichter ein und zaehlt die gesetzten Abschnitte', () => {
    render(
      <ColumnFilter
        label="Kunde" sections={KUNDE_SECTIONS} onChange={vi.fn()}
        values={{ ...LEER, locality: ['Winterthur'], phone: '079' }}
      />
    )
    expect(screen.getByRole('button', { name: 'Filter: Kunde' }).textContent).toContain('2')
  })

  it('laedt Werte erst beim Oeffnen nach', () => {
    // Die Ortschaftsliste aggregiert ueber den ganzen Bestand — sie gehoert nicht
    // in den Ladeweg der Liste.
    const onOpen = vi.fn()
    render(<ColumnFilter label="Kunde" sections={KUNDE_SECTIONS} values={LEER} onChange={vi.fn()} onOpen={onOpen} />)
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Filter: Kunde' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('Hilfsfunktionen', () => {
  it('activeSectionCount zaehlt nur gesetzte Abschnitte', () => {
    expect(activeSectionCount(KUNDE_SECTIONS, LEER)).toBe(0)
    expect(activeSectionCount(KUNDE_SECTIONS, { ...LEER, address: '  ' })).toBe(0)
    expect(activeSectionCount(KUNDE_SECTIONS, { ...LEER, address: 'Bahnhof' })).toBe(1)
  })

  it('clearedValues liefert je Variante den leeren Wert', () => {
    expect(clearedValues([...KUNDE_SECTIONS, { kind: 'daterange', key: 'created' }])).toEqual({
      locality: [], address: '', phone: '', created: { from: '', to: '' },
    })
  })
})
