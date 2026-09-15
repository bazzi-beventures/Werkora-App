import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProjectForm } from './useProjectForm'
import type { Customer } from '../../../api/admin/customers'
import type { Project } from '../../../api/admin/projects'

// Kunde wählen = Ansprechperson vorbelegen. Bis dahin standen Telefon und
// E-Mail im Kundenstamm und die Person in der Projektmaske; wer beides wollte,
// tippte es ab. Geprüft wird hier das Zusammenspiel im Hook — die Regeln selbst
// liegen (und werden getestet) in kontaktKundenstamm.ts.

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

const SCHUERMANN = customer({
  id: 'c-schuermann', name: 'R. Schürmann',
  phone: '079 626 19 90', email: 're58.schuermann@bluewin.ch',
  address: 'Haltenrebenstrasse 54, 8408 Winterthur',
})
const MUELLER = customer({
  id: 'c-mueller', name: 'Müller Hans', phone: '079 111 22 33',
  local_contact_name: 'Peter Abwart', local_contact_phone: '044 555 66 77',
})

function setup(project: Project | null = null) {
  return renderHook(() => useProjectForm({
    project,
    customers: [SCHUERMANN, MUELLER],
    schedulingEnabled: false,
    focusDetails: () => {},
  }))
}

describe('selectCustomer → Ansprechperson', () => {
  it('übernimmt Name, Telefon und E-Mail des Kunden ins neue Projekt', () => {
    const { result } = setup()
    act(() => result.current.selectCustomer('c-schuermann'))
    expect(result.current.kontakte).toEqual([{
      name: 'R. Schürmann',
      kommentar: 'Kunde',
      telefon: '079 626 19 90',
      email: 're58.schuermann@bluewin.ch',
      is_site_contact: false,
      customer_id: 'c-schuermann',
    }])
    // Die vorbelegte Zeile ist ungespeicherte Arbeit — sonst ginge sie beim
    // Verlassen der Maske kommentarlos verloren.
    expect(result.current.isDirty).toBe(true)
  })

  it('stapelt beim Kundenwechsel nicht, sondern ersetzt', () => {
    const { result } = setup()
    act(() => result.current.selectCustomer('c-schuermann'))
    act(() => result.current.selectCustomer('c-mueller'))
    expect(result.current.kontakte).toEqual([{
      name: 'Peter Abwart',
      kommentar: 'Baustellenkontakt',
      telefon: '044 555 66 77',
      email: '',
      is_site_contact: true,
      customer_id: 'c-mueller',
    }])
  })

  it('lässt eine bearbeitete Zeile stehen', () => {
    const { result } = setup()
    act(() => result.current.selectCustomer('c-schuermann'))
    act(() => result.current.updateKontakt(0, 'telefon', '052 000 00 00'))
    act(() => result.current.selectCustomer('c-mueller'))
    expect(result.current.kontakte).toHaveLength(1)
    expect(result.current.kontakte[0].telefon).toBe('052 000 00 00')
  })

  it('nimmt die Vorbelegung mit, wenn der Kunde wieder entfernt wird', () => {
    const { result } = setup()
    act(() => result.current.selectCustomer('c-schuermann'))
    act(() => result.current.selectCustomer(''))
    expect(result.current.kontakte).toEqual([])
    expect(result.current.customerId).toBe('')
  })

  it('rührt die Ansprechpersonen eines bestehenden Projekts nicht an', () => {
    const project = {
      id: 'p-1', name: 'Gottardi', art_der_arbeit: [],
      kontakte: [{ name: 'Beat Huber', kommentar: '', telefon: '079 9', email: '' }],
    } as unknown as Project
    const { result } = setup(project)
    act(() => result.current.selectCustomer('c-schuermann'))
    expect(result.current.kontakte.map(k => k.name)).toEqual(['Beat Huber'])
  })
})
