/**
 * Rechnung ohne Projekt (docs/specs/admin-werkora-ch.md §8.2 a).
 *
 * Geprüft wird vor allem, was **nicht** rausgeht: eine Rechnung ist nach dem
 * Versand ein Beleg, und ein Eingabefehler darin fällt niemandem mehr auf.
 * Die Prüfregeln sind deshalb als reine Funktion herausgezogen (`zeilenPruefen`)
 * und werden hier einzeln festgenagelt — dieselbe Trennung wie bei der
 * Geld-Logik im Backend.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const generateFreeInvoice = vi.fn()

vi.mock('../../api/admin', () => ({
  generateFreeInvoice: (i: unknown) => generateFreeInvoice(i),
}))

vi.mock('./CustomerCombobox', () => ({
  CustomerCombobox: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="Kunde" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      <option value="k-1">Gehlhaar GmbH</option>
    </select>
  ),
}))

import FreeInvoiceDialog, { zeilenPruefen } from './FreeInvoiceDialog'

const zeile = (over: Partial<{ text: string; menge: string; einheit: string; einzelpreis: string }> = {}) => ({
  text: 'Abo', menge: '1', einheit: 'Mt', einzelpreis: '70', ...over,
})

describe('zeilenPruefen', () => {
  it('nimmt eine gewöhnliche Zeile an', () => {
    const { fehler, positionen } = zeilenPruefen([zeile()])
    expect(fehler).toBeNull()
    expect(positionen).toEqual([{ text: 'Abo', menge: 1, einheit: 'Mt', einzelpreis: 70 }])
  })

  it('akzeptiert das Komma als Dezimaltrenner', () => {
    const { positionen } = zeilenPruefen([zeile({ einzelpreis: '70,50' })])
    expect(positionen[0].einzelpreis).toBe(70.5)
  })

  it('erlaubt eine negative Zeile — die Gutschrift auf einer Abo-Rechnung', () => {
    const { fehler, positionen } = zeilenPruefen([
      zeile({ einzelpreis: '200' }),
      zeile({ text: 'Rabatt Jahresabo', einzelpreis: '-50' }),
    ])
    expect(fehler).toBeNull()
    expect(positionen[1].einzelpreis).toBe(-50)
  })

  it('lehnt ab, wenn unter dem Strich nichts gefordert wird', () => {
    const { fehler } = zeilenPruefen([
      zeile({ einzelpreis: '70' }),
      zeile({ text: 'Gutschrift', einzelpreis: '-70' }),
    ])
    expect(fehler).toMatch(/grösser als 0/)
  })

  it('nennt die Nummer der fehlerhaften Zeile, nicht nur «ungültig»', () => {
    const { fehler } = zeilenPruefen([zeile(), zeile({ text: '  ' })])
    expect(fehler).toMatch(/Position 2/)
  })

  it('weist Menge 0 zurück, statt sie stillschweigend zu korrigieren', () => {
    expect(zeilenPruefen([zeile({ menge: '0' })]).fehler).toMatch(/Menge 0/)
  })

  it('weist eine Menge zurück, die keine Zahl ist', () => {
    expect(zeilenPruefen([zeile({ menge: 'drei' })]).fehler).toMatch(/keine Zahl/)
  })

  it('setzt eine leere Einheit auf «Stk», statt sie leer zu lassen', () => {
    expect(zeilenPruefen([zeile({ einheit: '  ' })]).positionen[0].einheit).toBe('Stk')
  })
})

describe('FreeInvoiceDialog', () => {
  beforeEach(() => {
    generateFreeInvoice.mockReset().mockResolvedValue({ invoice_number: 'RE-2026-001', total_amount: 70 })
  })

  const zeige = () =>
    render(<FreeInvoiceDialog customers={[]} onClose={vi.fn()} onCreated={vi.fn()} />)

  it('sendet nicht ohne Kunde', async () => {
    zeige()
    fireEvent.click(screen.getByRole('button', { name: 'Rechnung erzeugen' }))
    expect(generateFreeInvoice).not.toHaveBeenCalled()
    expect(screen.getByText('Kunde wählen.')).toBeTruthy()
  })

  it('sendet Kunde, Positionen und Frist so, wie das Backend sie erwartet', async () => {
    zeige()
    fireEvent.change(screen.getByLabelText('Kunde'), { target: { value: 'k-1' } })
    fireEvent.change(screen.getByLabelText('Beschreibung Position 1'), {
      target: { value: 'KI App, August' },
    })
    fireEvent.change(screen.getByLabelText('Einzelpreis Position 1'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechnung erzeugen' }))

    await waitFor(() => expect(generateFreeInvoice).toHaveBeenCalledWith({
      customer_id: 'k-1',
      positions: [{ text: 'KI App, August', menge: 1, einheit: 'Stk', einzelpreis: 70 }],
      payment_terms_days: 30,
      remark: undefined,
    }))
  })

  it('meldet einen Fehler des Servers, statt ihn zu verschlucken', async () => {
    generateFreeInvoice.mockRejectedValue(new Error('feature_disabled'))
    zeige()
    fireEvent.change(screen.getByLabelText('Kunde'), { target: { value: 'k-1' } })
    fireEvent.change(screen.getByLabelText('Beschreibung Position 1'), { target: { value: 'Abo' } })
    fireEvent.change(screen.getByLabelText('Einzelpreis Position 1'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechnung erzeugen' }))

    expect(await screen.findByText('feature_disabled')).toBeTruthy()
  })

  it('weist eine unmögliche Zahlungsfrist ab', async () => {
    zeige()
    fireEvent.change(screen.getByLabelText('Kunde'), { target: { value: 'k-1' } })
    fireEvent.change(screen.getByLabelText('Beschreibung Position 1'), { target: { value: 'Abo' } })
    fireEvent.change(screen.getByLabelText('Einzelpreis Position 1'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Zahlungsfrist (Tage)'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechnung erzeugen' }))

    expect(screen.getByText(/zwischen 0 und 365/)).toBeTruthy()
    expect(generateFreeInvoice).not.toHaveBeenCalled()
  })
})
