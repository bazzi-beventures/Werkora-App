import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adjustStock, listStockMovements } from './inventory'
import { apiFetch } from '../client'

// Spec docs/specs/lager-bestandsfuehrung.md §2.2, §6.2.
//
// Der Anlass: Diese Datei schickte bis zum 19.09.2026 `movement_type:
// 'adjustment'` — einen Wert, den die CHECK-Constraint der Datenbank nie
// kannte. Der Server prüfte den Insert nicht: der Bestand änderte sich, die
// Bewegung ging mit HTTP 400 verloren, und die Antwort war trotzdem
// erfolgreich. Jede Korrektur aus der Maske war damit unbelegt, und beim
// Zählen liess sich die Differenz nicht mehr erklären.
//
// Dieser Test ist der Ratchet dagegen: Was hier rausgeht, muss ein Wert sein,
// den die Datenbank annimmt.

vi.mock('../client', () => ({
  apiFetch: vi.fn(async () => ({ status: 'success', new_quantity: 7 })),
  apiBlobFetch: vi.fn(async () => new Blob()),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => `https://api.example${p}`,
}))

const fetchMock = vi.mocked(apiFetch)

// Die Werte der CHECK-Constraint aus Migration 20260919, Teilmenge "von Hand
// buchbar". `usage` entsteht am Rapport, `count` an der Inventur, `initial`
// beim Import — keiner davon darf aus dieser Maske kommen.
const ERLAUBT = ['delivery', 'correction', 'return']

beforeEach(() => {
  fetchMock.mockClear()
  fetchMock.mockResolvedValue({ status: 'success', new_quantity: 7 })
})

function gesendeteBewegungsart(): string {
  const [, init] = fetchMock.mock.calls[0]
  return JSON.parse(String((init as RequestInit).body)).movement_type
}

describe('Lagerbuchung', () => {
  it('schickt ohne Angabe eine Korrektur, nicht das alte adjustment', async () => {
    await adjustStock('A-1', -2, { note: 'Bruch' })
    expect(gesendeteBewegungsart()).toBe('correction')
    expect(ERLAUBT).toContain(gesendeteBewegungsart())
  })

  it('reicht die gewählte Bewegungsart durch', async () => {
    await adjustStock('A-1', 5, { movementType: 'delivery' })
    expect(gesendeteBewegungsart()).toBe('delivery')
  })

  it('schickt nur Arten, welche die Datenbank kennt', async () => {
    for (const art of ERLAUBT) {
      fetchMock.mockClear()
      await adjustStock('A-1', 1, { movementType: art as 'delivery' | 'correction' | 'return' })
      expect(ERLAUBT).toContain(gesendeteBewegungsart())
    }
  })

  it('gibt den neuen Bestand zurück, statt ihn selbst zu rechnen', async () => {
    fetchMock.mockResolvedValue({ status: 'success', new_quantity: 12.5 })
    const res = await adjustStock('A-1', 5, { movementType: 'delivery' })
    expect(res.new_quantity).toBe(12.5)
  })

  it('schickt die Differenz, nicht den neuen Bestand', async () => {
    await adjustStock('A-1', -3, { movementType: 'return', note: null })
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String((init as RequestInit).body)).quantity_delta).toBe(-3)
  })
})

describe('Bewegungsjournal', () => {
  it('blättert und kodiert die Artikelnummer', async () => {
    fetchMock.mockResolvedValue({ rows: [], total: 0, page: 2, page_size: 20 })
    await listStockMovements('A/1', { page: 2, pageSize: 20 })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/pwa/admin/inventory/A%2F1/movements')
    expect(String(url)).toContain('page=2')
    expect(String(url)).toContain('page_size=20')
  })
})
