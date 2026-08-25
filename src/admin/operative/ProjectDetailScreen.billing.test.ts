import { describe, it, expect } from 'vitest'
import { hasBillableReport } from './projectDetail/billingRules'

// Regression zur Billing-Heuristik: ein manuell erfasster Rapport (admin_manual,
// per Design ohne Unterschrift) muss als Rechnungsbasis zählen — sonst wird
// fälschlich use_quote=true erzwungen und die Offerte statt des Rapports
// verrechnet.
describe('hasBillableReport', () => {
  it('erkennt einen unterschriebenen Rapport als Rechnungsbasis', () => {
    expect(hasBillableReport([{ signature_timestamp: '2026-07-21T10:00:00Z' }])).toBe(true)
  })

  it('erkennt einen manuell erfassten Rapport (admin_manual) ohne Unterschrift', () => {
    expect(hasBillableReport([{ signature_timestamp: null, source: 'admin_manual' }])).toBe(true)
  })

  it('ignoriert einen Chat-Rapport ohne Unterschrift', () => {
    expect(hasBillableReport([{ signature_timestamp: null, source: 'chat' }])).toBe(false)
  })

  it('ist false für eine leere Rapportliste', () => {
    expect(hasBillableReport([])).toBe(false)
  })

  it('ein einziger verrechenbarer Rapport unter mehreren genügt', () => {
    expect(
      hasBillableReport([
        { signature_timestamp: null, source: 'chat' },
        { signature_timestamp: null, source: 'admin_manual' },
      ]),
    ).toBe(true)
  })
})

// ── Teilrapport-Ausnahmen (docs/specs/teilrapport.md §3.4 b) ──
// Spiegelbild von is_invoice_ready_report — läuft die Maske hier auseinander,
// bietet sie einen Rechnungslauf an, den der Server mit 400 ablehnt.

describe('hasBillableReport — Teilrapport', () => {
  it('lässt einen Teilrapport das Tor nie öffnen — auch nicht als admin_manual', () => {
    expect(hasBillableReport([{ source: 'admin_manual', is_partial: true } as never])).toBe(false)
    expect(hasBillableReport([{
      signature_timestamp: null, source: 'chat', is_partial: true,
    } as never])).toBe(false)
  })

  it('lässt den unterschriebenen Gesamtrapport das Tor öffnen', () => {
    expect(hasBillableReport([{
      signature_timestamp: '2026-08-08T10:00:00Z', source: 'chat',
    } as never])).toBe(true)
  })

  it('lässt den vom Büro gebündelten Gesamtrapport erst unterschrieben zählen', () => {
    // source 'admin_manual' allein reicht beim Behälter nicht — er ist keine
    // Erfassung, sondern der Träger der Kunden-Unterschrift.
    expect(hasBillableReport([{
      source: 'admin_manual', is_aggregate: true,
    } as never])).toBe(false)
    expect(hasBillableReport([{
      source: 'admin_manual', is_aggregate: true,
      signature_timestamp: '2026-08-08T10:00:00Z',
    } as never])).toBe(true)
  })

  it('lässt den vom PL ohne Unterschrift abgeschlossenen Gesamtrapport zählen', () => {
    // Der Ausweg für die Baustelle ohne Unterschrift — sonst blieben die Stunden
    // dauerhaft unverrechenbar.
    expect(hasBillableReport([{
      source: 'chat', is_aggregate: true, pl_accepted_at: '2026-08-20T09:00:00Z',
    } as never])).toBe(true)
  })

  it('übergeht den aufgelösten Gesamtrapport', () => {
    expect(hasBillableReport([{
      signature_timestamp: '2026-08-08T10:00:00Z', source: 'chat',
      dissolved_at: '2026-08-09T08:00:00Z',
    } as never])).toBe(false)
  })
})
