import { describe, it, expect, vi } from 'vitest'

// InvoicesScreen importiert den api-Client auf Modulebene — mocken, damit der
// Import der reinen Helper-Funktion keinen echten Client zieht.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiUrl: (p: string) => p,
}))

import { sammelrechnungHint } from '../utils/invoiceHints'

// Sammelrechnungs-Hinweis im Erfolgs-Toast: nur bei ≥2 abgedeckten Offerten —
// der Normalfall (eine Offerte) muss wortgleich zum bisherigen Toast bleiben.
describe('sammelrechnungHint', () => {
  it('bleibt leer ohne quote_numbers (ältere API / Rapport-Rechnung)', () => {
    expect(sammelrechnungHint(undefined)).toBe('')
    expect(sammelrechnungHint([])).toBe('')
  })

  it('bleibt leer bei genau einer Offerte (Normalfall unverändert)', () => {
    expect(sammelrechnungHint(['OFF-2026-014'])).toBe('')
  })

  it('nennt Anzahl und Nummern bei mehreren Offerten', () => {
    expect(sammelrechnungHint(['OFF-2026-014', 'OFF-2026-015'])).toBe(
      ' — Sammelrechnung über 2 Offerten (OFF-2026-014, OFF-2026-015)',
    )
  })
})
