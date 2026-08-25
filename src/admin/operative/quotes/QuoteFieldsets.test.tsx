import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExtraProductsFieldset, LaborFieldset, SpecialPositionsFieldset } from './QuoteFieldsets'
import type { Reorder } from '../QuoteRowControls'

// Diese Sektionen standen bis Charge H2 zweimal im QuotesScreen (Erstellen und
// Bearbeiten) und sind jetzt eine. Der Test hält die Stellen fest, an denen sich
// die beiden Masken noch unterscheiden dürfen — dort trennten sich vorher die Wege.

const ROLES = [
  { name: 'Monteur', job_title: 'Vorarbeiter', hourly_rate: 95 },
  { name: 'Lehrling', job_title: null, hourly_rate: 45 },
]

// Drag-and-drop ist im jsdom nicht sinnvoll bedienbar — die Sektion reicht diese
// Props nur durch (eigener Test: QuoteRowControls.test).
const NO_REORDER = {
  rowProps: () => ({}), handleProps: () => ({}), moveRow: () => {},
} as unknown as Reorder

function renderLabor(props: Partial<Parameters<typeof LaborFieldset>[0]> = {}) {
  const handlers = {
    onRoleChange: vi.fn(), onQuantityChange: vi.fn(), onHiddenChange: vi.fn(),
    onRemove: vi.fn(), onAdd: vi.fn(),
  }
  render(
    <LaborFieldset
      rows={[{ description: 'Monteur', quantity: '2' }]}
      roles={ROLES}
      montageEnabled={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('LaborFieldset', () => {
  it('meldet die gewählte Funktion — den Ansatz setzt die Maske selbst', async () => {
    const h = renderLabor()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Lehrling')
    expect(h.onRoleChange).toHaveBeenCalledWith(0, 'Lehrling')
  })

  it('zeigt den Zusatz zur Funktion und den Ansatz in der Auswahl', () => {
    renderLabor()
    expect(screen.getByRole('option', { name: /Monteur — Vorarbeiter/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Lehrling \(/ })).toBeInTheDocument()
  })

  it('«verstecken» nur bei aktivem Feature (montage_in_produktpreis)', () => {
    renderLabor()
    expect(screen.queryByText('verstecken')).not.toBeInTheDocument()
  })

  it('Stundenansatz-Feld nur, wenn die Maske eines mitgibt (Bearbeiten)', () => {
    renderLabor({ rateField: () => <input placeholder="CHF/h" /> })
    expect(screen.getByPlaceholderText('CHF/h')).toBeInTheDocument()
  })

  it('keepLastRow schützt die letzte Zeile vorm Entfernen (Erstellen)', () => {
    renderLabor({ keepLastRow: true })
    expect(screen.queryByTitle('Entfernen')).not.toBeInTheDocument()
  })

  it('ohne keepLastRow darf auch die letzte Zeile weg (Bearbeiten)', () => {
    renderLabor()
    expect(screen.getByTitle('Entfernen')).toBeInTheDocument()
  })
})

describe('ExtraProductsFieldset', () => {
  function renderExtra(props: Record<string, unknown> = {}) {
    const onUpdate = vi.fn()
    render(
      <ExtraProductsFieldset
        rows={[{ description: 'Storen', quantity: '1', unit: 'Stk', unit_price: '100' }]}
        optionalEnabled={false}
        reorder={NO_REORDER}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
        uploading={false}
        pdfError=""
        fileRef={{ current: null }}
        onPickPdf={vi.fn()}
        {...props}
      />,
    )
    return onUpdate
  }

  it('«Option» nur bei aktivem Feature (optionale_positionen)', () => {
    renderExtra()
    expect(screen.queryByText('Option')).not.toBeInTheDocument()
    screen.getByPlaceholderText('EK')  // die Kalkulationsfelder gibt es immer
  })

  it('reicht Änderungen als Patch weiter', async () => {
    const onUpdate = renderExtra()
    await userEvent.type(screen.getByPlaceholderText('Menge'), '2')
    expect(onUpdate).toHaveBeenCalledWith(0, { quantity: '12' })
  })

  it('zeigt den Fortschritt des PDF-Uploads und sperrt den Knopf', () => {
    renderExtra({ uploading: true })
    expect(screen.getByRole('button', { name: 'Wird extrahiert…' })).toBeDisabled()
  })

  it('nimmt Zusatz-Aktionen auf (Erstellen: manuelle Erfassung)', () => {
    renderExtra({ extraActions: <button>+ Manuell erfassen</button> })
    expect(screen.getByRole('button', { name: '+ Manuell erfassen' })).toBeInTheDocument()
  })

  it('meldet einen Upload-Fehler direkt beim Knopf', () => {
    renderExtra({ pdfError: 'Verbindung abgebrochen' })
    expect(screen.getByRole('alert')).toHaveTextContent('Verbindung abgebrochen')
  })
})

describe('SpecialPositionsFieldset', () => {
  it('zeigt Stunden + Ansatz nur im Stunden-Modus', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <SpecialPositionsFieldset
        rows={[{ description: 'Entsorgung', mode: 'pauschal', unit_price: '200', hours: '' }]}
        templates={[]}
        onChange={onChange}
      />,
    )
    expect(screen.getByPlaceholderText('Betrag CHF')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Stunden')).not.toBeInTheDocument()

    rerender(
      <SpecialPositionsFieldset
        rows={[{ description: 'Entsorgung', mode: 'stunden', unit_price: '95', hours: '3' }]}
        templates={[]}
        onChange={onChange}
      />,
    )
    expect(screen.getByPlaceholderText('Stunden')).toHaveValue('3')
    expect(screen.getByPlaceholderText('CHF/h')).toHaveValue('95')
  })

  it('legt aus einer Vorlage eine Zeile mit deren Vorgabewerten an', async () => {
    const onChange = vi.fn()
    render(
      <SpecialPositionsFieldset
        rows={[]}
        templates={[{ id: 't1', label: 'Demontage', pricing_mode: 'stunden', default_fee: 95, default_hours: 2, sort_order: 0, notes: null }]}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Demontage/ }))
    expect(onChange).toHaveBeenCalledWith([
      { description: 'Demontage', mode: 'stunden', unit_price: '95', hours: '2' },
    ])
  })
})
