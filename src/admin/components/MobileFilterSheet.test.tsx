import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileFilterSheet } from './MobileFilterSheet'
import { backHandlerCount, consumeBack, _resetBackHandlers } from '../../shared/backButton'
import type { FilterSection, FilterValues } from './ColumnFilter'

// Spec: docs/specs/projektliste-filter-sortierung.md §3.3.
// Auf dem Handy gibt es keinen Spaltenkopf, an den ein Trichter passt — dieselben
// Abschnitte stehen deshalb untereinander in einem Vollbild-Sheet.

const SECTIONS: FilterSection[] = [
  { kind: 'multi', key: 'invoiceStatus', title: 'Rechnung', options: [
    { value: 'bezahlt', label: 'Bezahlt' },
    { value: 'none', label: 'Keine Rechnung' },
  ] },
  { kind: 'text', key: 'phone', title: 'Telefon enthält' },
]

const LEER: FilterValues = { invoiceStatus: [], phone: '' }

beforeEach(() => _resetBackHandlers())

describe('MobileFilterSheet', () => {
  it('rendert nichts, solange es zu ist', () => {
    render(<MobileFilterSheet open={false} sections={SECTIONS} values={LEER} onApply={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(backHandlerCount()).toBe(0)
  })

  it('registriert sich am Zurueck-Stack der PWA', () => {
    // Overlays ohne Registrierung brechen den Zurueck-Stack: das Hardware-Zurueck
    // schloesse nicht das Sheet, sondern spraenge aus dem Screen heraus.
    const onClose = vi.fn()
    render(<MobileFilterSheet open sections={SECTIONS} values={LEER} onApply={vi.fn()} onClose={onClose} />)
    expect(backHandlerCount()).toBe(1)
    expect(consumeBack()).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('uebernimmt die Auswahl erst auf Knopfdruck und schliesst dann', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<MobileFilterSheet open sections={SECTIONS} values={LEER} onApply={onApply} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Keine Rechnung'))
    fireEvent.change(screen.getByLabelText('Telefon enthält'), { target: { value: '079' } })
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ invoiceStatus: ['none'], phone: '079' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('"Zurücksetzen" leert die Abschnitte, ohne zu schliessen', () => {
    const onClose = vi.fn()
    render(<MobileFilterSheet open sections={SECTIONS} values={{ invoiceStatus: ['bezahlt'], phone: '079' }} onApply={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }))
    expect((screen.getByLabelText('Telefon enthält') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Bezahlt') as HTMLInputElement).checked).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('zeigt den aktuellen Stand beim Oeffnen', () => {
    render(<MobileFilterSheet open sections={SECTIONS} values={{ invoiceStatus: ['bezahlt'], phone: '' }} onApply={vi.fn()} onClose={vi.fn()} />)
    expect((screen.getByLabelText('Bezahlt') as HTMLInputElement).checked).toBe(true)
  })
})
