import { describe, it, expect } from 'vitest'
import { customerLinkTarget } from './customerLinkTarget'

const muster = { id: 'c1', name: 'Peter Muster' }
const meier = { id: 'c2', name: 'Anna Meier' }

describe('customerLinkTarget (WW-51)', () => {
  it('nimmt den Kunden aus der Maske', () => {
    expect(customerLinkTarget(meier, muster, 'c2')).toEqual(meier)
  })

  it('fällt auf das Embed zurück, wenn die Auswahlliste den Kunden nicht kennt (archiviert, noch nicht geladen)', () => {
    expect(customerLinkTarget(null, muster, 'c1')).toEqual(muster)
  })

  it('verlinkt nie den alten Kunden nach einem Wechsel', () => {
    expect(customerLinkTarget(null, muster, 'c2')).toBeNull()
  })

  it('kein Kunde am Projekt → kein Link', () => {
    expect(customerLinkTarget(null, null, null)).toBeNull()
    expect(customerLinkTarget(null, muster, null)).toBeNull()
  })
})
