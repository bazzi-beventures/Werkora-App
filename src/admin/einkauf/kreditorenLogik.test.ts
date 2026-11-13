/**
 * Reine Helfer der Lieferantenrechnungen — docs/specs/lieferantenrechnung-bexio.md §8.1.
 */
import { describe, expect, it } from 'vitest'
import type { KreditorDetail } from '../../api/kreditoren'
import {
  abweichung, baueKreditorPatch, filterMeine, istGeaendert, kopfAus, leereZeile, liestNoch,
  parseZahl, praefixVorschlag, pruefeSumme, statusBadgeClass, statusLabel, zeilenAus,
} from './kreditorenLogik'

function bill(over: Partial<KreditorDetail> = {}): KreditorDetail {
  return {
    id: 'b1', status: 'zu_pruefen', source: 'upload',
    supplier_id: 's1', supplier_name: 'Griesser AG',
    bill_number: 'R-100', bill_date: '2026-11-01', due_date: '2026-12-01',
    currency: 'CHF', gross_total: 1081, is_credit_note: false,
    erfasst_am: '2026-11-02T08:00:00Z', erfasst_von_name: 'Bea Büro',
    lese_status: 'gelesen', lese_fehler: null,
    projekte: [], sperre: false, iban_status: 'bekannt',
    visiert_von_name: null, visiert_am: null, skonto_pct: null, skonto_until: null, meine: false,
    supplier: {
      id: 's1', name: 'Griesser AG', uid: null, street: null, zip: null, city: null,
      default_account: '4000', default_bucket: 'projekt',
    },
    supplier_name_beleg: 'Griesser AG', supplier_uid_beleg: null,
    net_total: 1000, vat_total: 81,
    payment: { iban: 'CH4431999123000889012', reference_type: 'QRR', reference: '210000000003139471430009017', amount: 1081, currency: 'CHF', creditor_name: 'Griesser AG' },
    payment_source: 'qr',
    file_name: 'r.pdf', mime_type: 'application/pdf', pages: 1,
    lines: [
      { id: 'l1', pos: 1, text: 'Lamellenstoren', quantity: 2, net_amount: 600, vat_rate: 8.1, account_no: '4000',
        project_id: 'p1', project: { project_id: 'p1', number: '2600515', name: 'Bad Muster', customer: 'Muster', locality: 'Chur' }, bucket: 'projekt' },
      { id: 'l2', pos: 2, text: 'Montage', quantity: null, net_amount: 400, vat_rate: 8.1, account_no: '4400',
        project_id: null, project: null, bucket: 'gemeinkosten' },
    ],
    vorschlag: { supplier_id: 's1', supplier_quelle: 'uid', supplier_neu: null, projekt_kandidaten: [], lieferscheine: [] },
    hinweise: [],
    aktionen: { bearbeiten: true, erneut_lesen: true, zur_visierung: true, visieren: false, visum_zuruecknehmen: false, ablehnen: false, verwerfen: true },
    visum_block: null, iban_bestaetigung_noetig: false, abgelehnt_grund: null,
    konten: [{ nr: '4000', name: 'Materialaufwand' }, { nr: '4400', name: 'Fremdleistungen' }],
    mwst_saetze: [8.1, 2.6, 3.8, 0],
    ...over,
  }
}

describe('Status', () => {
  it('beschriftet jeden Status, «uebergeben» als «In bexio»', () => {
    expect(statusLabel('zu_pruefen')).toBe('Zu prüfen')
    expect(statusLabel('zu_visieren')).toBe('Zu visieren')
    expect(statusLabel('uebergeben')).toBe('In bexio')
    expect(statusLabel('verworfen')).toBe('Verworfen')
  })

  it('nimmt die bestehenden Badge-Klassen', () => {
    expect(statusBadgeClass('bezahlt')).toBe('admin-badge admin-badge-paid')
    expect(statusBadgeClass('abgelehnt')).toBe('admin-badge admin-badge-rejected')
    expect(statusBadgeClass('unbekannt')).toBe('admin-badge admin-badge-draft')
  })
})

describe('Liste', () => {
  it('«Nur meine» filtert auf meine, aus lässt alles stehen', () => {
    const bills = [{ id: 'a', meine: true }, { id: 'b', meine: false }]
    expect(filterMeine(bills, true).map(b => b.id)).toEqual(['a'])
    expect(filterMeine(bills, false).map(b => b.id)).toEqual(['a', 'b'])
  })

  it('pollt nur, solange irgendwo gelesen wird', () => {
    expect(liestNoch([{ lese_status: 'gelesen' }, { lese_status: 'laeuft' }])).toBe(true)
    expect(liestNoch([{ lese_status: 'gelesen' }, { lese_status: 'fehler' }])).toBe(false)
    expect(liestNoch([])).toBe(false)
  })
})

describe('Zahlen', () => {
  it('liest Schweizer Eingaben', () => {
    expect(parseZahl("1'234.50")).toBe(1234.5)
    expect(parseZahl('1 234,5')).toBe(1234.5)
    expect(parseZahl('')).toBeNull()
    expect(parseZahl('abc')).toBeNaN()
  })

  it('Summenprüfung mit Toleranz 0.05', () => {
    expect(pruefeSumme([600, 400], 1000)).toMatchObject({ summe: 1000, differenz: 0, stimmt: true })
    expect(pruefeSumme([600, 400.04], 1000).stimmt).toBe(true)
    const daneben = pruefeSumme([600, 364], 1000)
    expect(daneben).toMatchObject({ summe: 964, differenz: -36, stimmt: false })
    // Ohne Netto auf dem Beleg gibt es nichts zu vergleichen.
    expect(pruefeSumme([1, 2], null)).toMatchObject({ summe: 3, differenz: null, stimmt: true })
    // Unlesbare Zeilen zählen als 0, statt die Summe zu NaN zu machen.
    expect(pruefeSumme([Number.NaN, null, 5], 5).summe).toBe(5)
  })

  it('Abweichung effektiv gegen geplant', () => {
    expect(abweichung(8910, 8420)).toEqual({ chf: 490, pct: 5.8 })
    expect(abweichung(100, 0)).toEqual({ chf: 100, pct: null })
    expect(abweichung(null, 100)).toEqual({ chf: null, pct: null })
  })
})

describe('PATCH aus dem Formular', () => {
  it('unverändert → leerer PATCH, nicht geändert', () => {
    const b = bill()
    const { patch, fehler } = baueKreditorPatch(b, kopfAus(b), zeilenAus(b))
    expect(patch).toEqual({})
    expect(fehler).toEqual([])
    expect(istGeaendert(b, kopfAus(b), zeilenAus(b))).toBe(false)
  })

  it('schickt nur geänderte Kopf-Felder, Zahlen geparst, leer als null', () => {
    const b = bill()
    const kopf = { ...kopfAus(b), bill_number: 'R-101', net_total: "1'000.50", skonto_until: '' , due_date: '' }
    const { patch } = baueKreditorPatch(b, kopf, zeilenAus(b))
    expect(patch).toEqual({ bill_number: 'R-101', net_total: 1000.5, due_date: null })
    expect(patch.lines).toBeUndefined()
  })

  it('Positionen immer vollständig, sobald sich eine ändert', () => {
    const b = bill()
    const zeilen = zeilenAus(b)
    zeilen[1] = { ...zeilen[1], account_no: '4000' }
    const { patch } = baueKreditorPatch(b, kopfAus(b), zeilen)
    expect(patch.lines).toHaveLength(2)
    expect(patch.lines![0]).toEqual({
      text: 'Lamellenstoren', quantity: 2, net_amount: 600, vat_rate: 8.1,
      account_no: '4000', project_id: 'p1', bucket: 'projekt',
    })
    // Ziel ≠ Projekt: kein Projekt mitschicken.
    expect(patch.lines![1]).toMatchObject({ bucket: 'gemeinkosten', project_id: null, account_no: '4000' })
  })

  it('Zeile ohne Konto oder Netto wird nicht gesendet', () => {
    const b = bill()
    const neu = { ...leereZeile(b), account_no: '' }
    const { fehler } = baueKreditorPatch(b, kopfAus(b), [...zeilenAus(b), neu])
    expect(fehler).toEqual(['Zeile 3: Netto fehlt oder ist keine Zahl', 'Zeile 3: Konto fehlt'])
  })

  it('neue Zeile übernimmt Konto und Ziel des Lieferanten', () => {
    const z = leereZeile(bill())
    expect(z).toMatchObject({ account_no: '4000', bucket: 'projekt', vat_rate: '8.1' })
  })

  it('Zahlung nie über einen QR-Zahlteil hinweg, von Hand nur ohne QR', () => {
    const qr = bill()
    expect(kopfAus(qr).iban).toBe('')
    const { patch: p1 } = baueKreditorPatch(qr, { ...kopfAus(qr), iban: 'CH00' }, zeilenAus(qr))
    expect(p1.payment).toBeUndefined()

    const ohne = bill({ payment: null, payment_source: 'keine' })
    const { patch: p2 } = baueKreditorPatch(ohne, { ...kopfAus(ohne), iban: 'ch93 0076 2011 6238 5295 7', reference: '' }, zeilenAus(ohne))
    expect(p2.payment).toEqual({ iban: 'CH9300762011623852957', reference: null })
  })

  it('unlesbare Zahl im Kopf meldet das Feld', () => {
    const b = bill()
    const { fehler } = baueKreditorPatch(b, { ...kopfAus(b), gross_total: 'zwölf' }, zeilenAus(b))
    expect(fehler).toEqual(['Brutto: keine gültige Zahl'])
  })
})

describe('Neuer Lieferant', () => {
  it('Präfix aus den ersten drei Buchstaben', () => {
    expect(praefixVorschlag('Griesser AG')).toBe('GRI')
    expect(praefixVorschlag('Ölmühle 3 GmbH')).toBe('OLM')
    expect(praefixVorschlag('4B Fenster')).toBe('BFE')
  })
})
