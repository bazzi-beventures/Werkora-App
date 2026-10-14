import { describe, expect, it } from 'vitest'
import { customerAttentionLine, customerRecipientName } from './customers'

// Spiegel von tests/unit/test_customers_api.py::TestFirmaZuHanden (WW-20).
describe('Firmenkunde: Firma zuerst, Person «z. H.»', () => {
  const firma = { name: 'Peter Muster', company: 'Muster AG', salutation: 'herr', billing_name: null }

  it('Firma ist der Empfänger, Person darunter', () => {
    expect(customerRecipientName(firma)).toBe('Muster AG')
    expect(customerAttentionLine(firma)).toBe('z. H. Herr Peter Muster')
  })

  it('ohne Firma bleibt der Name', () => {
    const privat = { ...firma, company: null }
    expect(customerRecipientName(privat)).toBe('Peter Muster')
    expect(customerAttentionLine(privat)).toBe('')
  })

  it('abweichender Empfänger und Firma-als-Name: keine z.-H.-Zeile', () => {
    expect(customerRecipientName({ ...firma, billing_name: 'Verwaltung AG' })).toBe('Verwaltung AG')
    expect(customerAttentionLine({ ...firma, billing_name: 'Verwaltung AG' })).toBe('')
    expect(customerAttentionLine({ ...firma, name: 'Muster AG' })).toBe('')
  })
})
