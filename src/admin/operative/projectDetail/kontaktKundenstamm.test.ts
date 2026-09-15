import { describe, it, expect } from 'vitest'
import type { Customer } from '../../../api/admin/customers'
import type { Kontakt } from '../../../api/admin/projects'
import {
  applyKontaktCandidate, candidatesOf, customerInputFromKontakt, customerToLink,
  kontaktFromCustomer, kontakteOhneKundenstamm, linkKontakteToCustomers,
  searchKontaktCandidates, seedKontaktFromCustomer,
} from './kontaktKundenstamm'

function customer(over: Partial<Customer> & { id: string; name: string }): Customer {
  return {
    salutation: null, company: null, email: null, additional_emails: null,
    phone: null, phone_landline: null, address: null, billing_name: null,
    billing_address: null, object_address: null, local_contact_name: null,
    local_contact_phone: null, owner_contact_name: null, owner_contact_phone: null,
    notes: null, created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const MUELLER = customer({
  id: 'c-mueller', name: 'Müller Hans', phone: '079 111 22 33', email: 'hans@example.ch',
  local_contact_name: 'Peter Abwart', local_contact_phone: '044 555 66 77',
  owner_contact_name: 'Erben Müller',
})
const ZIMMERLI = customer({
  id: 'c-zimmerli', name: 'Zimmerli AG', company: 'Zimmerli Storen', phone_landline: '052 222 33 44',
})
const MEIER = customer({ id: 'c-meier', name: 'Meier Rolf' })

const kontakt = (over: Partial<Kontakt> = {}): Kontakt =>
  ({ name: '', kommentar: '', telefon: '', email: '', ...over })

describe('candidatesOf', () => {
  it('liefert Kunde, Baustellenkontakt und Eigentümer als eigene Personen', () => {
    const cands = candidatesOf(MUELLER)
    expect(cands.map(c => [c.role, c.name, c.telefon])).toEqual([
      ['kunde', 'Müller Hans', '079 111 22 33'],
      ['baustellenkontakt', 'Peter Abwart', '044 555 66 77'],
      ['eigentuemer', 'Erben Müller', ''],
    ])
    expect(cands.every(c => c.customerId === 'c-mueller')).toBe(true)
  })

  it('nimmt das Festnetz, wenn kein Mobile hinterlegt ist', () => {
    expect(candidatesOf(ZIMMERLI)[0].telefon).toBe('052 222 33 44')
  })
})

describe('searchKontaktCandidates', () => {
  const all = [MUELLER, ZIMMERLI, MEIER]

  it('schlägt unter zwei Zeichen nichts vor', () => {
    expect(searchKontaktCandidates('m', all)).toEqual([])
    expect(searchKontaktCandidates(' ', all)).toEqual([])
  })

  it('findet den Baustellenkontakt eines Stammkunden über dessen Namen', () => {
    const hits = searchKontaktCandidates('abwart', all)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ role: 'baustellenkontakt', name: 'Peter Abwart', customerId: 'c-mueller' })
  })

  it('findet über die Firma, ignoriert Umlaute und Gross-/Kleinschreibung', () => {
    expect(searchKontaktCandidates('storen', all).map(c => c.name)).toEqual(['Zimmerli AG'])
    // Der Kundenname zählt für alle Personen des Kunden mit: wer «Müller» tippt,
    // sieht auch dessen Baustellenkontakt und Eigentümer — der Kunde selbst zuerst.
    expect(searchKontaktCandidates('MUELLER', all).map(c => c.name))
      .toEqual(['Müller Hans', 'Peter Abwart', 'Erben Müller'])
  })

  it('verlangt jedes Wort (UND-Logik)', () => {
    expect(searchKontaktCandidates('Zimmerli Peter', all)).toEqual([])
    expect(searchKontaktCandidates('Müller Peter', all).map(c => c.name)).toEqual(['Peter Abwart'])
    // Der volle Kundenname trifft auch die Personen dieses Kunden — der exakte
    // Treffer steht aber vorne.
    expect(searchKontaktCandidates('Müller Hans', all)[0].name).toBe('Müller Hans')
  })

  it('reiht Namensanfang vor Fundstelle mittendrin', () => {
    const rolf = customer({ id: 'c-rolf', name: 'Rolf Meierhans' })
    expect(searchKontaktCandidates('Meier', [MEIER, rolf]).map(c => c.name)).toEqual(['Meier Rolf', 'Rolf Meierhans'])
    expect(searchKontaktCandidates('Meier', [rolf, MEIER]).map(c => c.name)).toEqual(['Meier Rolf', 'Rolf Meierhans'])
  })

  it('deckelt die Liste', () => {
    const many = Array.from({ length: 20 }, (_, i) => customer({ id: `c-${i}`, name: `Kunde ${i}` }))
    expect(searchKontaktCandidates('kunde', many, 8)).toHaveLength(8)
  })
})

describe('applyKontaktCandidate', () => {
  it('füllt Name, Telefon, E-Mail und verknüpft den Kunden', () => {
    const k = applyKontaktCandidate(kontakt({ kommentar: 'Architekt' }), candidatesOf(MUELLER)[0])
    expect(k).toEqual({
      name: 'Müller Hans', kommentar: 'Architekt', telefon: '079 111 22 33',
      email: 'hans@example.ch', customer_id: 'c-mueller',
    })
  })

  it('lässt getippte Nummer und E-Mail stehen, wenn der Stamm nichts weiss', () => {
    const k = applyKontaktCandidate(kontakt({ telefon: '078 9', email: 'x@y.ch' }), candidatesOf(MEIER)[0])
    expect(k.telefon).toBe('078 9')
    expect(k.email).toBe('x@y.ch')
  })

  it('belegt den leeren Kommentar mit der Rolle vor', () => {
    const [, site, owner] = candidatesOf(MUELLER)
    expect(applyKontaktCandidate(kontakt(), site).kommentar).toBe('Baustellenkontakt')
    expect(applyKontaktCandidate(kontakt(), owner).kommentar).toBe('Eigentümer')
    expect(applyKontaktCandidate(kontakt(), candidatesOf(MEIER)[0]).kommentar).toBe('')
  })
})

describe('kontakteOhneKundenstamm', () => {
  const all = [MUELLER, MEIER]

  it('nennt neu erfasste Personen ohne Verknüpfung', () => {
    const neu = kontakt({ name: 'Anna Neu', telefon: '079' })
    expect(kontakteOhneKundenstamm([], [neu], all)).toEqual([neu])
  })

  it('übergeht verknüpfte, leere und bereits bekannte Zeilen', () => {
    const rows = [
      kontakt({ name: 'Müller Hans', customer_id: 'c-mueller' }),
      kontakt({ name: '   ' }),
      kontakt({ telefon: '079' }),
      // abgetippt statt geklickt — ein Stammkunde trägt den Namen schon
      kontakt({ name: 'meier rolf' }),
    ]
    expect(kontakteOhneKundenstamm([], rows, all)).toEqual([])
  })

  it('fragt bei einem bestehenden Projekt nur nach den neuen Zeilen', () => {
    const alt = kontakt({ name: 'Beat Huber', telefon: '079' })
    const neu = kontakt({ name: 'Anna Neu' })
    expect(kontakteOhneKundenstamm([alt], [alt, neu], all)).toEqual([neu])
    // dieselbe Person mit anderer Nummer gilt als geändert, nicht als bekannt
    expect(kontakteOhneKundenstamm([alt], [{ ...alt, telefon: '078' }], all)).toHaveLength(1)
  })
})

describe('customerInputFromKontakt', () => {
  it('trimmt und lässt Leeres als null', () => {
    expect(customerInputFromKontakt(kontakt({ name: ' Anna Neu ', telefon: '  ', email: 'a@b.ch' })))
      .toEqual({ name: 'Anna Neu', phone: null, email: 'a@b.ch' })
  })
})

describe('linkKontakteToCustomers / customerToLink', () => {
  const rows = [
    kontakt({ name: 'Anna Neu', is_site_contact: true }),
    kontakt({ name: 'Bruno Bau' }),
    kontakt({ name: 'Müller Hans', customer_id: 'c-mueller' }),
  ]
  const created = [{ id: 'c-bruno', name: 'Bruno Bau' }, { id: 'c-anna', name: 'Anna Neu' }]

  it('hängt die neuen Kunden über den Namen an ihre Zeilen', () => {
    expect(linkKontakteToCustomers(rows, created).map(k => k.customer_id))
      .toEqual(['c-anna', 'c-bruno', 'c-mueller'])
  })

  it('verknüpft bevorzugt den Baustellenkontakt, wenn das Projekt keinen Kunden hat', () => {
    const linked = linkKontakteToCustomers(rows, created)
    expect(customerToLink(null, linked, created)).toBe('c-anna')
    expect(customerToLink('', linked, [created[0]])).toBe('c-bruno')
  })

  it('lässt einen vorhandenen Projektkunden in Ruhe', () => {
    expect(customerToLink('c-mueller', rows, created)).toBeNull()
    expect(customerToLink(null, rows, [])).toBeNull()
  })
})

describe('kontaktFromCustomer', () => {
  it('nimmt Telefon UND E-Mail des Kunden, wenn er keinen Baustellenkontakt hat', () => {
    expect(kontaktFromCustomer(customer({
      id: 'c-1', name: 'R. Schürmann', phone: '079 626 19 90', email: 're58@bluewin.ch',
    }))).toEqual({
      name: 'R. Schürmann',
      kommentar: 'Kunde',
      telefon: '079 626 19 90',
      email: 're58@bluewin.ch',
      // Ohne Stern: eine blosse Vorbelegung soll nicht plötzlich einen «Kontakt
      // vor Ort» auf Offerte/Rechnung drucken.
      is_site_contact: false,
      customer_id: 'c-1',
    })
  })

  it('bevorzugt den Baustellenkontakt des Kunden — mit Stern', () => {
    expect(kontaktFromCustomer(MUELLER)).toEqual({
      name: 'Peter Abwart',
      kommentar: 'Baustellenkontakt',
      telefon: '044 555 66 77',
      // Die einzige E-Mail, die der Stamm kennt, ist die des Kunden.
      email: 'hans@example.ch',
      is_site_contact: true,
      customer_id: 'c-mueller',
    })
  })

  it('fällt beim Telefon auf Mobile vor Festnetz zurück', () => {
    expect(kontaktFromCustomer(ZIMMERLI)?.telefon).toBe('052 222 33 44')
    const beides = customer({ id: 'c-b', name: 'B', phone: '079', phone_landline: '052' })
    expect(kontaktFromCustomer(beides)?.telefon).toBe('079')
    // Baustellenkontakt ohne eigene Nummer: die des Kunden ist besser als keine
    // (gleiche Kette wie db.project_contacts_with_customer_fallback).
    const abwart = customer({ id: 'c-a', name: 'A', phone: '079', local_contact_name: 'Abwart' })
    expect(kontaktFromCustomer(abwart)?.telefon).toBe('079')
  })

  it('liefert null, wenn der Kunde weder Name noch Telefon noch E-Mail hergibt', () => {
    expect(kontaktFromCustomer(customer({ id: 'c-0', name: '   ' }))).toBeNull()
  })
})

describe('seedKontaktFromCustomer', () => {
  const seed = kontaktFromCustomer(MUELLER)!
  const anderer = kontaktFromCustomer(customer({ id: 'c-x', name: 'Frau X', phone: '076' }))!

  it('belegt die leere Liste vor', () => {
    expect(seedKontaktFromCustomer([], seed, null)).toEqual([seed])
  })

  it('lässt eine selbst erfasste Person in Ruhe', () => {
    const eigen = [kontakt({ name: 'Anna Neu', telefon: '079' })]
    expect(seedKontaktFromCustomer(eigen, seed, null)).toEqual(eigen)
  })

  it('füllt leere Platzhalter-Zeilen auf und nimmt ihnen den Stern ab', () => {
    const leer = [kontakt({ is_site_contact: true }), kontakt({ kommentar: 'Hausabwart' })]
    const out = seedKontaktFromCustomer(leer, seed, null)
    expect(out[0]).toEqual(seed)
    expect(out.filter(k => k.is_site_contact)).toEqual([seed])
    expect(out).toHaveLength(3)
  })

  it('ersetzt die unveränderte Vorbelegung beim Kundenwechsel', () => {
    expect(seedKontaktFromCustomer([seed], anderer, seed)).toEqual([anderer])
  })

  it('lässt eine von Hand bearbeitete Vorbelegung stehen', () => {
    const bearbeitet = { ...seed, telefon: '079 000 00 00' }
    expect(seedKontaktFromCustomer([bearbeitet], anderer, seed)).toEqual([bearbeitet])
  })

  it('räumt die Vorbelegung weg, wenn der Kunde entfernt wird', () => {
    expect(seedKontaktFromCustomer([seed], null, seed)).toEqual([])
  })
})
