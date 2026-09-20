import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StockModal } from './MaterialsScreen'
import { adjustStock } from '../../api/admin/inventory'
import type { Material } from '../../api/admin/materials'

// Spec docs/specs/lager-bestandsfuehrung.md §2.2, §6.2.
//
// Der Ratchet am Dialog selbst, nicht nur an der API-Funktion: Die Maske
// schickte bis zum 19.09.2026 `movement_type: 'adjustment'` — einen Wert, den
// die CHECK-Constraint der Datenbank nie kannte. Der Bestand änderte sich, die
// Bewegung ging mit HTTP 400 verloren, die Antwort war trotzdem erfolgreich.
// Jede Korrektur aus dieser Maske war damit unbelegt.

vi.mock('../../api/admin/inventory', async () => {
  const echt = await vi.importActual<typeof import('../../api/admin/inventory')>(
    '../../api/admin/inventory',
  )
  return { ...echt, adjustStock: vi.fn(async () => ({ status: 'success', new_quantity: 7 })) }
})
vi.mock('./MovementList', () => ({ default: () => <div>Journal</div> }))

const mockAdjust = vi.mocked(adjustStock)

// Die Werte der CHECK-Constraint aus Migration 20260919, Teilmenge
// "von Hand buchbar".
const ERLAUBT = ['delivery', 'correction', 'return']

function material(over: Partial<Material> = {}): Material {
  return {
    id: 'mat-1', art_nr: 'A-1', name: 'Endkappe', supplier_id: null,
    category: null, unit: 'Stk', unit_price: null, cost_price: 4,
    markup_pct: null, calc_vk: 10, is_active: true, image_path: null,
    inventory: [{ quantity: 6, min_quantity: 5 }],
    ...over,
  } as Material
}

function oeffnen(m = material()) {
  return render(<StockModal material={m} onClose={() => {}} onSaved={() => {}} />)
}

beforeEach(() => { mockAdjust.mockClear() })

describe('Lager-Dialog', () => {
  it('bietet nur Bewegungsarten an, welche die Datenbank kennt', () => {
    oeffnen()
    const optionen = Array.from(
      (screen.getByRole('combobox') as HTMLSelectElement).options,
    ).map(o => o.value)
    expect(optionen).toEqual(ERLAUBT)
    expect(optionen).not.toContain('adjustment')
  })

  it('bucht die gewählte Art, nicht das alte adjustment', async () => {
    oeffnen()
    fireEvent.change(screen.getByLabelText('Änderung (+ Zugang / − Abgang)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buchen' }))
    await waitFor(() => expect(mockAdjust).toHaveBeenCalled())
    const [, , opts] = mockAdjust.mock.calls[0]
    expect(ERLAUBT).toContain(opts?.movementType as string)
    expect(opts?.movementType).toBe('delivery')
  })

  it('sperrt die Korrektur, solange keine Begründung dasteht', async () => {
    oeffnen()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'correction' } })
    fireEvent.change(screen.getByLabelText('Änderung (+ Zugang / − Abgang)'), { target: { value: '-2' } })
    expect(screen.getByRole('button', { name: 'Buchen' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Begründung/), { target: { value: '2 Stk beschädigt' } })
    expect(screen.getByRole('button', { name: 'Buchen' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Buchen' }))
    await waitFor(() => expect(mockAdjust).toHaveBeenCalled())
    expect(mockAdjust.mock.calls[0][2]?.note).toBe('2 Stk beschädigt')
  })

  it('faerbt genau auf der Schwelle noch nicht rot — wie Trigger und Kennzahlen', () => {
    // Bestand 5, Mindestbestand 5: die Datenbank nennt das 'ok' (Vergleich '<').
    // Bis 20260919 verglich die Maske mit '<=' und widersprach ihr.
    const { container } = oeffnen(material({ inventory: [{ quantity: 5, min_quantity: 5 }] }))
    const zahl = container.querySelector('div[style*="font-size: 28px"]') as HTMLElement
    expect(zahl.style.color).not.toContain('danger')
  })

  it('faerbt unter der Schwelle rot', () => {
    const { container } = oeffnen(material({ inventory: [{ quantity: 4, min_quantity: 5 }] }))
    const zahl = container.querySelector('div[style*="font-size: 28px"]') as HTMLElement
    expect(zahl.style.color).toContain('danger')
  })
})
