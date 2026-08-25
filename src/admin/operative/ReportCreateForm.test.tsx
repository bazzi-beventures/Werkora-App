import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ReportCreateForm, materialUnitPrice, materialLineTotal, materialRowsTotal, fixedRowsTotal,
} from './ReportCreateForm'
import type { ReportFormProject, ReportFormStaff } from './ReportCreateForm'
import type { ProjectQuote } from './projectDetail/tabs'
import { apiFetch } from '../../api/client'
import { getMe } from '../../api/auth'

// Nur den Netzwerk-Call mocken — der Rest (Formatierung, useBackButton, InfoHint)
// bleibt echt.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

// Feature-Flags: das Formular fragt beim Mounten `/pwa/me` ab (Einbauort-Spalte).
// Ohne Mock landet der GET im apiFetch-Zähler und verfälscht die Nutzlast-Prüfungen.
// Die Tests, die den Flag-Pfad brauchen, überschreiben den Rückgabewert lokal.
vi.mock('../../api/auth', () => ({
  getMe: vi.fn(async () => ({ feature_flags: {} })),
}))

// MaterialCombobox durch ein schlichtes <select> ersetzen — die echte Combobox
// nutzt Portale/getBoundingClientRect/useIsMobile und ist im jsdom schwer zu
// bedienen. Der Kontrakt (value ⇄ onChange(art_nr)) bleibt erhalten.
vi.mock('./MaterialCombobox', () => ({
  MaterialCombobox: ({ value, onChange }: { value: string; onChange: (a: string) => void }) => (
    <select aria-label="Material" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Material wählen —</option>
      <option value="STG123">STG123</option>
      <option value="STG999">STG999</option>
    </select>
  ),
}))

const mockFetch = vi.mocked(apiFetch)

// Die zuletzt an apiFetch übergebene POST-Nutzlast (Material-Zeilen laden vorher
// per GET nach — deshalb nicht blind calls[0] nehmen).
function lastPostBody(): Record<string, unknown> {
  const call = [...mockFetch.mock.calls].reverse().find(
    c => (c[1] as RequestInit | undefined)?.method === 'POST',
  )
  return JSON.parse((call![1] as RequestInit).body as string)
}

function postFired(): boolean {
  return mockFetch.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'POST')
}

const PROJECT: ReportFormProject = { id: 'p1', name: 'MFH Sonnhalde' }
const STAFF: ReportFormStaff[] = [
  { id: 's1', name: 'Anna' },
  { id: 's2', name: 'Bob' },
]

function makeQuote(over: Partial<ProjectQuote> = {}): ProjectQuote {
  return {
    id: 1,
    parent_id: 1,
    version: 1,
    quote_number: 'OFF-2026-014',
    total_amount: 12500,
    status: 'akzeptiert',
    created_at: '2026-07-20T10:00:00Z',
    pdf_url: null,
    xlsx_url: null,
    customer_email: null,
    ...over,
  }
}

function renderForm(
  quotes: ProjectQuote[] = [],
  onDone = vi.fn(),
  onCancel = vi.fn(),
  project: ReportFormProject = PROJECT,
) {
  render(
    <ReportCreateForm
      project={project}
      staff={STAFF}
      quotes={quotes}
      onDone={onDone}
      onCancel={onCancel}
    />,
  )
  return { onDone, onCancel }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ report_id: 42 })
  vi.mocked(getMe).mockResolvedValue({ feature_flags: {} } as never)
})

// Katalog für die Preisanzeige. `calc_vk` (kalkulierter VK) schlägt `unit_price`
// (Stammpreis) — genau wie in der Beschriftung der echten Combobox.
const CATALOG = [
  { art_nr: 'STG123', name: 'Getriebehalter', unit_price: 8, calc_vk: 12.5, unit: 'Stk' },
  { art_nr: 'STG999', name: 'Getriebelager', unit_price: 40, calc_vk: null, unit: 'Stk' },
]

// GET /pwa/admin/materials liefert den Katalog, alles andere die Standard-Antwort.
function withCatalog() {
  mockFetch.mockImplementation(async (path: string) =>
    path.startsWith('/pwa/admin/materials') ? CATALOG : { report_id: 42 },
  )
}

describe('Preis-Helfer (reine Funktionen)', () => {
  it('nimmt den kalkulierten VK, sonst den Stammpreis', () => {
    expect(materialUnitPrice(CATALOG[0])).toBe(12.5)
    expect(materialUnitPrice(CATALOG[1])).toBe(40)
  })

  it('rechnet die Zeilensumme erst mit Artikel UND Menge > 0', () => {
    expect(materialLineTotal(CATALOG[0], '4')).toBe(50)
    expect(materialLineTotal(CATALOG[0], '2,5')).toBe(31.25) // Schweizer Komma
    expect(materialLineTotal(CATALOG[0], '')).toBeNull()
    expect(materialLineTotal(CATALOG[0], '0')).toBeNull()
    expect(materialLineTotal(null, '4')).toBeNull()
  })

  it('summiert nur vollständige Materialzeilen', () => {
    const byArtNr = new Map(CATALOG.map(m => [m.art_nr, m]))
    const total = materialRowsTotal(
      [
        { artNr: 'STG123', amount: '2' },   // 25.00
        { artNr: 'STG999', amount: '1' },   // 40.00
        { artNr: 'STG123', amount: '' },    // unvollständig → 0
        { artNr: '', amount: '5' },         // kein Artikel → 0
        { artNr: 'UNBEKANNT', amount: '3' }, // nicht im Katalog → 0
      ],
      byArtNr,
    )
    expect(total).toBe(65)
  })

  it('summiert Fixpositionen als Menge × Preis', () => {
    expect(fixedRowsTotal([
      { amount: '2', unitPrice: '10.50' },
      { amount: '3', unitPrice: '5' },
      { amount: '', unitPrice: '99' },  // ohne Menge zählt die Zeile nicht
      { amount: '4', unitPrice: '' },   // ohne Preis → 0, aber kein NaN
    ])).toBe(36)
  })
})

describe('ReportCreateForm', () => {
  it('zeigt VK, Zeilensumme und Zwischensumme der Materialzeilen', async () => {
    const user = userEvent.setup()
    withCatalog()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    // Ohne Artikel gibt es nichts anzuzeigen.
    expect(screen.queryByLabelText('Preis Materialzeile 1')).not.toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText('Material'), 'STG123')
    // Artikel gewählt, Menge noch leer → nur der VK je Einheit.
    const price = await screen.findByLabelText('Preis Materialzeile 1')
    expect(price).toHaveTextContent('CHF 12.50/Stk')
    expect(price).not.toHaveTextContent('=')

    await user.type(screen.getByLabelText('Materialmenge 1'), '4')
    expect(screen.getByLabelText('Preis Materialzeile 1')).toHaveTextContent('= CHF 50.00')
    expect(screen.getByText(/Zwischensumme Material:/)).toHaveTextContent('CHF 50.00')
  })

  it('zeigt die Zeilensumme einer Fixposition und deren Zwischensumme', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '3')
    await user.type(screen.getByLabelText('Fixposition Preis 1'), '12.50')

    expect(screen.getByLabelText('Fixposition Summe 1')).toHaveTextContent('= CHF 37.50')
    expect(screen.getByText(/Zwischensumme Fixpositionen:/)).toHaveTextContent('CHF 37.50')
  })

  it('zeigt die Summe der Kleinmaterial-Pauschale (Menge × Betrag)', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    expect(screen.queryByLabelText('Kleinmaterial Summe')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Kleinmaterial Menge'))
    await user.type(screen.getByLabelText('Kleinmaterial Menge'), '2')
    await user.type(screen.getByLabelText('Kleinmaterial Betrag'), '35')

    expect(screen.getByLabelText('Kleinmaterial Summe')).toHaveTextContent('= CHF 70.00')
  })

  it('fügt Mitarbeiter-Zeilen hinzu und entfernt sie wieder', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByLabelText('Mitarbeiter 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mitarbeiter 2')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Zeile' }))
    expect(screen.getByLabelText('Mitarbeiter 2')).toBeInTheDocument()

    // Zweite Zeile wieder entfernen.
    await user.click(screen.getAllByLabelText('Zeile entfernen')[1])
    expect(screen.queryByLabelText('Mitarbeiter 2')).not.toBeInTheDocument()
  })

  it('blockiert das Speichern ohne ausgewählten Mitarbeiter', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Mindestens ein Mitarbeiter mit Stunden erforderlich.')).toBeInTheDocument()
  })

  it('blockiert das Speichern bei leerem Arbeitsbeschrieb', async () => {
    const user = userEvent.setup()
    renderForm() // keine Offerte → Beschrieb leer

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Arbeitsbeschrieb erforderlich.')).toBeInTheDocument()
  })

  it('sendet exakt { report_date, description, staff:[{staff_id, hours}] }', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    fireEvent.change(screen.getByLabelText('Datum *'), { target: { value: '2026-07-21' } })
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6.5')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/pwa/admin/projects/p1/reports')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      report_date: '2026-07-21',
      description: 'Arbeiten gemäss Offerte OFF-2026-014',
      staff: [{ staff_id: 's1', hours: 6.5, hour_type: 'standard' }],
      massaufnahme: false,
      beratung: false,
      is_warranty: false,
      art_der_arbeit: [],
    })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('füllt den Arbeitsbeschrieb aus der Offerten-Nummer vor', () => {
    renderForm([makeQuote({ quote_number: 'OFF-2026-099' })])
    expect(screen.getByLabelText('Arbeitsbeschrieb *')).toHaveValue('Arbeiten gemäss Offerte OFF-2026-099')
  })

  it('lässt den Beschrieb leer, wenn keine Offerte existiert', () => {
    renderForm([])
    expect(screen.getByLabelText('Arbeitsbeschrieb *')).toHaveValue('')
  })

  it('lehnt denselben Mitarbeiter mit derselben Stundenart ab', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: '+ Zeile' }))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 2'), 's1')
    await user.type(screen.getByLabelText('Stunden 2'), '3')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Ein Mitarbeiter ist mit derselben Stundenart doppelt erfasst.')).toBeInTheDocument()
  })

  it('erlaubt denselben Mitarbeiter mit Baustelle UND Werkstatt', async () => {
    // Der Werkstatt-Tarif ist ein anderer (staff_roles.hourly_rate_werkstatt) —
    // die Aufteilung auf zwei Zeilen ist der Sinn der Sache, keine Dublette.
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '1.25')
    await user.click(screen.getByRole('button', { name: '+ Zeile' }))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 2'), 's1')
    await user.type(screen.getByLabelText('Stunden 2'), '1.25')
    await user.selectOptions(screen.getByLabelText('Stundenart 2'), 'werkstatt')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().staff).toEqual([
      { staff_id: 's1', hours: 1.25, hour_type: 'standard' },
      { staff_id: 's1', hours: 1.25, hour_type: 'werkstatt' },
    ])
  })

  it('deckelt die Tagesstunden pro Mitarbeiter über beide Stundenarten', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '20')
    await user.click(screen.getByRole('button', { name: '+ Zeile' }))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 2'), 's1')
    await user.type(screen.getByLabelText('Stunden 2'), '20')
    await user.selectOptions(screen.getByLabelText('Stundenart 2'), 'werkstatt')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Ein Mitarbeiter hat insgesamt mehr als 24 Stunden an diesem Tag.')).toBeInTheDocument()
  })

  // ── Phase 2: Material ─────────────────────────────────────

  it('fügt Materialzeilen hinzu und entfernt sie wieder', async () => {
    const user = userEvent.setup()
    renderForm()

    // Standardmässig keine Materialzeile.
    expect(screen.queryByLabelText('Material')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    expect(screen.getAllByLabelText('Material')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    expect(screen.getAllByLabelText('Material')).toHaveLength(2)

    await user.click(screen.getAllByLabelText('Materialzeile entfernen')[1])
    expect(screen.getAllByLabelText('Material')).toHaveLength(1)
  })

  it('sendet nur vollständige Materialzeilen als { art_nr, amount } und lässt leere weg', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    // Zeile 1 vollständig (Artikel + Menge), Zeile 2 bleibt leer → wird ausgeschlossen.
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(screen.getAllByLabelText('Material')[0], 'STG123')
    await user.type(screen.getByLabelText('Materialmenge 1'), '3,5') // Schweizer Komma

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const body = lastPostBody()
    expect(body.materials).toEqual([{ art_nr: 'STG123', amount: 3.5 }])
    // Kein Kleinmaterial-Key, solange kein Betrag erfasst wurde.
    expect(body).not.toHaveProperty('kleinmaterial')
  })

  it('schliesst eine Materialzeile ohne gewählten Artikel aus', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    // Eine gültige Zeile und eine, die nur eine Menge hat, aber keinen Artikel …
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(screen.getAllByLabelText('Material')[0], 'STG999')
    await user.type(screen.getByLabelText('Materialmenge 1'), '2')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().materials).toEqual([{ art_nr: 'STG999', amount: 2 }])
  })

  it('blockiert eine Materialzeile mit Artikel aber ohne Menge', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(screen.getByLabelText('Material'), 'STG123')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Materialposition: Menge muss grösser als 0 sein.')).toBeInTheDocument()
  })

  it('blockiert eine Materialzeile mit Menge aber ohne Artikel', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.type(screen.getByLabelText('Materialmenge 1'), '4')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Materialposition: bitte zuerst einen Artikel wählen.')).toBeInTheDocument()
  })

  // ── Phase 2: Klein-/Schmiermaterial ───────────────────────

  it('sendet Kleinmaterial nur, wenn ein Betrag erfasst ist', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.type(screen.getByLabelText('Kleinmaterial Betrag'), '25')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().kleinmaterial).toEqual({
      item_name: 'Kleinmaterial',
      count: 1,
      amount_chf: 25,
    })
  })

  it('lässt den Kleinmaterial-Key weg, wenn kein Betrag erfasst ist (Phase-1-Nutzlast)', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    // Nur Mitarbeiter + Beschrieb, Kleinmaterial-Betrag bleibt leer (Menge Default 1).
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const body = lastPostBody()
    expect(body).not.toHaveProperty('kleinmaterial')
    expect(body).not.toHaveProperty('materials')
    // Exakt die Grundform: Material-/Kleinmaterial-Keys entfallen, die
    // Einsatzart-Flags und die Leistungsart sind immer dabei (das Backend erbt sie
    // sonst stillschweigend vom Projekt).
    expect(body).toEqual({
      report_date: expect.any(String),
      description: 'Arbeiten gemäss Offerte OFF-2026-014',
      staff: [{ staff_id: 's1', hours: 6, hour_type: 'standard' }],
      massaufnahme: false,
      beratung: false,
      is_warranty: false,
      art_der_arbeit: [],
    })
  })

  it('blockiert Kleinmaterial mit Betrag aber ohne Menge', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.clear(screen.getByLabelText('Kleinmaterial Menge'))
    await user.type(screen.getByLabelText('Kleinmaterial Betrag'), '25')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Klein-/Schmiermaterial: Menge muss eine ganze Zahl grösser als 0 sein.')).toBeInTheDocument()
  })

  // ── Phase 2: warnings im 201 ──────────────────────────────

  it('behandelt warnings im 201 als Erfolg und ruft onDone', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    mockFetch.mockResolvedValue({ report_id: 7, warnings: ['Lager für STG123 nicht abgebucht'] })

    const { onDone } = renderForm([makeQuote()])
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Lager für STG123 nicht abgebucht'))
    alertSpy.mockRestore()
  })

  // ── Phase 3: Material aus Offerte (Fixpreis-Positionen) ───────

  // material_items enthält eine Eventualposition (optional) — die wird beim
  // Übernehmen übersprungen. extra_product_items/-charge/installation dürfen NICHT
  // in die Zeilen wandern (die rechnet der rapportbasierte Rechnungspfad bereits
  // automatisch — sie hier zu tragen würde doppelt verrechnen).
  const QUOTE_DETAIL = {
    id: 1,
    quote_number: 'OFF-2026-014',
    material_items: [
      { description: 'Storen Typ X', quantity: 2, unit: 'Stk', unit_price: 450, total_price: 900 },
      { description: 'Motor 24V', quantity: 1, unit: 'Stk', unit_price: 300, total_price: 300, optional: true },
      { description: 'Kurbelstange', quantity: 3, unit: 'm', unit_price: 20, total_price: 60 },
    ],
    extra_product_items: [{ description: 'Produkt A', quantity: 1, unit: 'Stk', unit_price: 1000, total_price: 1000 }],
    extra_charge_items: [{ description: 'Zuschlag', total_price: 100 }],
    installation_items: [{ description: 'Montage', quantity: 1, unit: 'Psch', unit_price: 500, total_price: 500 }],
    special_items: [],
  }

  // apiFetch nach Method/URL routen: Rapport per POST, Offert-Detail per GET.
  function routeFetch(detail: Record<string, unknown> = QUOTE_DETAIL) {
    mockFetch.mockImplementation((path, options) => {
      if (options?.method === 'POST') return Promise.resolve({ report_id: 42 })
      if (typeof path === 'string' && path.startsWith('/pwa/admin/quotes/')) {
        return Promise.resolve(detail)
      }
      return Promise.resolve([]) // Material-Katalog o.ä.
    })
  }

  it('übernimmt nur material_items der Offerte (ohne Eventual-/Produkt-/Zuschlagspositionen)', async () => {
    const user = userEvent.setup()
    routeFetch()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))

    await waitFor(() => expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toBeInTheDocument())
    // Zwei nicht-optionale material_items → zwei Zeilen.
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Storen Typ X')
    expect(screen.getByLabelText('Fixposition Menge 1')).toHaveValue('2')
    expect(screen.getByLabelText('Fixposition Einheit 1')).toHaveValue('Stk')
    expect(screen.getByLabelText('Fixposition Preis 1')).toHaveValue('450')
    expect(screen.getByLabelText('Fixposition Bezeichnung 2')).toHaveValue('Kurbelstange')
    expect(screen.queryByLabelText('Fixposition Bezeichnung 3')).not.toBeInTheDocument()
    // Eventualposition (Motor) übersprungen; Produkte/Zuschläge/Montage nicht übernommen.
    expect(screen.queryByDisplayValue('Motor 24V')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Produkt A')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Zuschlag')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Montage')).not.toBeInTheDocument()
    // Genau ein GET aufs Offert-Detail.
    expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/quotes/1')
  })

  it('sendet die (bearbeiteten) Fixpositionen als fixed_materials', async () => {
    const user = userEvent.setup()
    routeFetch()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Storen Typ X'))

    // Erste Zeile ist editierbar — Menge mit Schweizer Komma ändern.
    await user.clear(screen.getByLabelText('Fixposition Menge 1'))
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '2,5')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    // source_quote_id: aus welcher Offerte die Zeile stammt. Der Server merkt sie
    // sich an der Position und übernimmt dieselbe Offerte danach nicht noch einmal
    // auf einem weiteren Rapport des Projekts (docs/specs/rapport-nachtrag.md §3.5).
    expect(lastPostBody().fixed_materials).toEqual([
      { item_name: 'Storen Typ X', amount: 2.5, unit: 'Stk', unit_price: 450, source_quote_id: 1 },
      { item_name: 'Kurbelstange', amount: 3, unit: 'm', unit_price: 20, source_quote_id: 1 },
    ])
    // Regulärer Katalog-Material-Key bleibt unberührt (keine Katalogzeile erfasst).
    expect(lastPostBody()).not.toHaveProperty('materials')
  })

  it('lädt bei erneutem Klick neu statt zu duplizieren', async () => {
    const user = userEvent.setup()
    routeFetch()
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
  })

  it('behält eine von Hand erfasste Fixposition beim erneuten Übernehmen', async () => {
    const user = userEvent.setup()
    routeFetch()
    renderForm([makeQuote()])

    // Zuerst eine manuelle Position erfassen …
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Handnotiz')
    // … dann Offerten-Material übernehmen: die manuelle Zeile bleibt erhalten.
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(3))
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Handnotiz')
    expect(screen.getByLabelText('Fixposition Bezeichnung 2')).toHaveValue('Storen Typ X')
  })

  it('erlaubt eine frei erfasste Fixposition ohne Offerte', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm() // keine Offerte → Beschrieb leer

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.type(screen.getByLabelText('Arbeitsbeschrieb *'), 'Reparatur')

    // "Material aus Offerte übernehmen" ist ohne Offerte deaktiviert.
    expect(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Ersatzteil')
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '4')
    await user.type(screen.getByLabelText('Fixposition Preis 1'), '12,5')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().fixed_materials).toEqual([
      { item_name: 'Ersatzteil', amount: 4, unit: 'Stk', unit_price: 12.5 },
    ])
  })

  it('lässt den fixed_materials-Key weg, wenn keine Fixposition erfasst ist', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody()).not.toHaveProperty('fixed_materials')
  })

  it('zeigt eine Inline-Meldung, wenn das Offert-Material nicht geladen werden kann', async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValue(new Error('boom'))
    renderForm([makeQuote()])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))

    await waitFor(() =>
      expect(screen.getByText('Material der Offerte konnte nicht geladen werden.')).toBeInTheDocument(),
    )
    // Kein Absturz, keine Zeile erzeugt.
    expect(screen.queryByLabelText('Fixposition Bezeichnung 1')).not.toBeInTheDocument()
  })

  it('blockiert eine Fixposition mit Bezeichnung aber ohne Menge', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Ersatzteil')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Fixposition: Menge muss grösser als 0 sein.')).toBeInTheDocument()
  })

  it('blockiert eine Fixposition mit Menge aber ohne Bezeichnung', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Menge 1'), '3')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    expect(postFired()).toBe(false)
    expect(screen.getByText('Fixposition: bitte eine Bezeichnung erfassen.')).toBeInTheDocument()
  })

  // ── Mehrfach angenommene Offerten: additive Übernahme pro Offerte ──────────
  // Kunde nimmt Offerte 1 UND Offerte 2 an ('mehrfach'-Gruppe). Früher warf der
  // zweite Import den ersten weg (fromQuote: boolean) — jetzt ersetzt ein Import
  // nur die Zeilen DERSELBEN Offerte (fromQuoteId).

  const QUOTE_A = makeQuote({ id: 1, quote_number: 'OFF-2026-001', created_at: '2026-07-10T10:00:00Z' })
  const QUOTE_B = makeQuote({ id: 2, quote_number: 'OFF-2026-002', created_at: '2026-07-20T10:00:00Z' })

  const DETAIL_A = {
    id: 1,
    quote_number: 'OFF-2026-001',
    material_items: [{ description: 'Storen Typ X', quantity: 2, unit: 'Stk', unit_price: 450, total_price: 900 }],
  }
  const DETAIL_B = {
    id: 2,
    quote_number: 'OFF-2026-002',
    material_items: [{ description: 'Markise Typ Y', quantity: 1, unit: 'Stk', unit_price: 800, total_price: 800 }],
  }

  // Offert-Detail nach ID routen (statt für jede ID dasselbe Fixture zu liefern).
  function routeFetchById() {
    mockFetch.mockImplementation((path, options) => {
      if (options?.method === 'POST') return Promise.resolve({ report_id: 42 })
      if (path === '/pwa/admin/quotes/1') return Promise.resolve(DETAIL_A)
      if (path === '/pwa/admin/quotes/2') return Promise.resolve(DETAIL_B)
      return Promise.resolve([])
    })
  }

  it('sammelt das Material zweier Offerten statt es zu ersetzen', async () => {
    const user = userEvent.setup()
    routeFetchById()
    const { onDone } = renderForm([QUOTE_B, QUOTE_A]) // Default: neueste akzeptierte = B

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    // Offerte B (Default) übernehmen …
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Markise Typ Y'))

    // … dann auf Offerte A wechseln und ebenfalls übernehmen.
    await user.selectOptions(screen.getByLabelText('Offerte wählen'), '1')
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    // BEIDE Material-Sets landen auf dem Rapport.
    expect(lastPostBody().fixed_materials).toEqual([
      { item_name: 'Markise Typ Y', amount: 1, unit: 'Stk', unit_price: 800, source_quote_id: 2 },
      { item_name: 'Storen Typ X', amount: 2, unit: 'Stk', unit_price: 450, source_quote_id: 1 },
    ])
  })

  it('ersetzt beim erneuten Import nur die Zeilen derselben Offerte', async () => {
    const user = userEvent.setup()
    routeFetchById()
    renderForm([QUOTE_B, QUOTE_A])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(1))
    await user.selectOptions(screen.getByLabelText('Offerte wählen'), '1')
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))

    // Nochmals Offerte A importieren: A wird ersetzt, B bleibt → weiterhin 2 Zeilen.
    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Markise Typ Y')
    expect(screen.getByLabelText('Fixposition Bezeichnung 2')).toHaveValue('Storen Typ X')
  })

  it('kennzeichnet übernommene Zeilen mit der Offertennummer', async () => {
    const user = userEvent.setup()
    routeFetchById()
    renderForm([QUOTE_B, QUOTE_A])

    await user.click(screen.getByRole('button', { name: 'Material aus Offerte übernehmen' }))
    // Die Offertennummer steht auch im Kopf der Sektion — hier gezielt das Zeilen-Badge.
    await waitFor(() => expect(screen.getAllByTitle('Aus dieser Offerte übernommen')).toHaveLength(1))
    expect(screen.getByTitle('Aus dieser Offerte übernommen')).toHaveTextContent('OFF-2026-002')

    // Von Hand erfasste Zeilen tragen kein Badge.
    await user.click(screen.getByRole('button', { name: '+ Position' }))
    expect(screen.getAllByTitle('Aus dieser Offerte übernommen')).toHaveLength(1)
  })

  it('weist auf die Übernahme pro Offerte hin, wenn mehrere angenommen sind', () => {
    renderForm([QUOTE_B, QUOTE_A])
    expect(screen.getByText(/2 angenommene Offerten/)).toBeInTheDocument()
  })

  it('zeigt den Mehrfach-Hinweis nicht bei nur einer angenommenen Offerte', () => {
    renderForm([QUOTE_A, makeQuote({ id: 3, quote_number: 'OFF-2026-003', status: 'gesendet' })])
    expect(screen.queryByText(/angenommene Offerten/)).not.toBeInTheDocument()
  })

  // ── Sammel-Import: alle angenommenen Offerten in einem Schritt ─────────────
  // Gegenstück zur Vereinigung im Monteur-Chat-Rapport (merge_accepted_quotes):
  // ein Klick holt das Material ALLER angenommenen Offerten, Reihenfolge
  // variant_rank/id («Offerte 1» vor «Offerte 2»).

  it('übernimmt das Material aller angenommenen Offerten mit einem Klick', async () => {
    const user = userEvent.setup()
    routeFetchById()
    const { onDone } = renderForm([QUOTE_B, QUOTE_A])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '6')

    await user.click(screen.getByRole('button', { name: 'Material aller angenommenen Offerten übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
    // Reihenfolge wie die Vereinigung: Offerte A (id 1) vor Offerte B (id 2).
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Storen Typ X')
    expect(screen.getByLabelText('Fixposition Bezeichnung 2')).toHaveValue('Markise Typ Y')

    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(lastPostBody().fixed_materials).toEqual([
      { item_name: 'Storen Typ X', amount: 2, unit: 'Stk', unit_price: 450, source_quote_id: 1 },
      { item_name: 'Markise Typ Y', amount: 1, unit: 'Stk', unit_price: 800, source_quote_id: 2 },
    ])
  })

  it('Sammel-Import ist idempotent und behält Handzeilen', async () => {
    const user = userEvent.setup()
    routeFetchById()
    renderForm([QUOTE_B, QUOTE_A])

    await user.click(screen.getByRole('button', { name: '+ Position' }))
    await user.type(screen.getByLabelText('Fixposition Bezeichnung 1'), 'Handposition')

    await user.click(screen.getByRole('button', { name: 'Material aller angenommenen Offerten übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(3))
    // Nochmals: ersetzt nur die Offerten-Zeilen, die Handzeile bleibt → weiterhin 3.
    await user.click(screen.getByRole('button', { name: 'Material aller angenommenen Offerten übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(3))
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Handposition')
  })

  it('setzt den Beschrieb-Vorschlag auf alle angenommenen Offertennummern', async () => {
    const user = userEvent.setup()
    routeFetchById()
    renderForm([QUOTE_B, QUOTE_A])

    await user.click(screen.getByRole('button', { name: 'Material aller angenommenen Offerten übernehmen' }))
    await waitFor(() => expect(screen.getByLabelText(/Arbeitsbeschrieb/)).toHaveValue(
      'Arbeiten gemäss Offerten OFF-2026-001 + OFF-2026-002',
    ))
  })

  it('überschreibt einen von Hand geänderten Beschrieb nicht', async () => {
    const user = userEvent.setup()
    routeFetchById()
    renderForm([QUOTE_B, QUOTE_A])

    const desc = screen.getByLabelText(/Arbeitsbeschrieb/)
    await user.clear(desc)
    await user.type(desc, 'Eigener Text')
    await user.click(screen.getByRole('button', { name: 'Material aller angenommenen Offerten übernehmen' }))
    await waitFor(() => expect(screen.getAllByLabelText(/Fixposition Bezeichnung/)).toHaveLength(2))
    expect(desc).toHaveValue('Eigener Text')
  })

  it('zeigt den Sammel-Knopf nur bei mehreren angenommenen Offerten', () => {
    renderForm([QUOTE_A])
    expect(
      screen.queryByRole('button', { name: 'Material aller angenommenen Offerten übernehmen' }),
    ).not.toBeInTheDocument()
  })

  // ── Einsatzart, Stundenart, Einbauort (Spec rapport-papier-erfassungsluecken) ──

  it('sendet Werkstattstunden als hour_type', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.selectOptions(screen.getByLabelText('Stundenart 1'), 'werkstatt')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().staff).toEqual([
      { staff_id: 's1', hours: 4, hour_type: 'werkstatt' },
    ])
  })

  it('sendet Massaufnahme und Beratung', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByLabelText('Massaufnahme'))
    await user.click(screen.getByLabelText('Beratung'))
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().massaufnahme).toBe(true)
    expect(lastPostBody().beratung).toBe(true)
  })

  it('belegt das Garantie-Häkchen aus dem Projekt vor', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()], vi.fn(), vi.fn(), { ...PROJECT, is_warranty: true })

    expect(screen.getByLabelText('Garantiefall')).toBeChecked()

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().is_warranty).toBe(true)
  })

  it('sendet ein abgewähltes Garantie-Häkchen als false', async () => {
    // Sonst liesse sich in einem Garantie-Projekt nie ein verrechenbarer Einsatz
    // erfassen — genau der gemischte Fall, für den das Rapport-Flag existiert.
    const user = userEvent.setup()
    renderForm([makeQuote()], vi.fn(), vi.fn(), { ...PROJECT, is_warranty: true })

    await user.click(screen.getByLabelText('Garantiefall'))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().is_warranty).toBe(false)
  })

  it('belegt die Leistungsart aus dem Projekt vor und sendet sie mit', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()], vi.fn(), vi.fn(), { ...PROJECT, art_der_arbeit: ['Neumontage'] })

    expect(screen.getByLabelText('Neumontage')).toBeChecked()
    expect(screen.getByLabelText('Reparatur')).not.toBeChecked()

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().art_der_arbeit).toEqual(['Neumontage'])
  })

  it('erlaubt eine vom Projekt abweichende Leistungsart', async () => {
    // Der eigentliche Zweck: auf einem Neumontage-Projekt ist dieser Einsatz eine
    // Reparatur. Bis zur Migration 20260809 gab es dafür kein Feld.
    const user = userEvent.setup()
    renderForm([makeQuote()], vi.fn(), vi.fn(), { ...PROJECT, art_der_arbeit: ['Neumontage'] })

    await user.click(screen.getByLabelText('Neumontage'))   // abwählen
    await user.click(screen.getByLabelText('Reparatur'))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().art_der_arbeit).toEqual(['Reparatur'])
  })

  it('sendet eine leer geräumte Leistungsart als leere Liste', async () => {
    // Leer ist eine Aussage — sonst erbte das Backend wieder vom Projekt.
    const user = userEvent.setup()
    renderForm([makeQuote()], vi.fn(), vi.fn(), { ...PROJECT, art_der_arbeit: ['Neumontage'] })

    await user.click(screen.getByLabelText('Neumontage'))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().art_der_arbeit).toEqual([])
  })

  it('ignoriert nicht-kanonische Alt-Werte des Projekts bei der Vorbelegung', async () => {
    // «Garantiefall» war vor Migration 20260419 eine Leistungsart; das Backend
    // nimmt den Wert nicht mehr an, die Leiste darf ihn also nicht anbieten.
    // (Das gleichnamige Häkchen der Einsatzart-Leiste ist etwas anderes — deshalb
    // innerhalb des Leistungsart-Fieldsets suchen.)
    const user = userEvent.setup()
    renderForm([makeQuote()], vi.fn(), vi.fn(),
      { ...PROJECT, art_der_arbeit: ['Garantiefall', 'Reparatur'] })

    const leistungsart = within(screen.getByRole('group', { name: /^Leistungsart/ }))
    expect(leistungsart.getByLabelText('Reparatur')).toBeChecked()
    expect(leistungsart.queryByLabelText('Garantiefall')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().art_der_arbeit).toEqual(['Reparatur'])
  })

  it('bietet alle sechs Leistungsarten an', async () => {
    renderForm([makeQuote()])

    for (const label of ['Neumontage', 'Wiedermontage', 'Umbau/Ersatz', 'Reparatur',
                         'Service/Wartung', 'Demontage']) {
      expect(screen.getByLabelText(label)).not.toBeChecked()
    }
  })

  // ── Einbauort: EIN Feld je Rapport (Migration 20260815) ────────────────
  // Bis dahin gab es eines je Materialzeile — bei allen Zeilen desselben Einsatzes
  // derselbe Wert. Jetzt eine Kopfangabe (reports.einbauort), sichtbar nur bei
  // Mandanten mit Flag `material_standort`.

  it('zeigt das Einbauort-Feld nur mit Feature-Flag', async () => {
    renderForm([makeQuote()])

    expect(screen.queryByLabelText(/Einbauort/)).not.toBeInTheDocument()
  })

  it('bietet kein Einbauort-Feld je Materialzeile an', async () => {
    vi.mocked(getMe).mockResolvedValue(
      { feature_flags: { material_standort: { enabled: true } } } as never,
    )
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await screen.findByLabelText(/Einbauort/)
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    expect(screen.queryByLabelText('Einbauort 1')).not.toBeInTheDocument()
    // Genau EIN Feld, egal wie viele Materialzeilen offen sind.
    expect(screen.getAllByLabelText(/Einbauort/)).toHaveLength(1)
  })

  it('sendet den Einbauort als Rapport-Feld, wenn das Flag aktiv ist', async () => {
    vi.mocked(getMe).mockResolvedValue(
      { feature_flags: { material_standort: { enabled: true } } } as never,
    )
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: '+ Materialposition' }))
    await user.selectOptions(await screen.findByLabelText('Material'), 'STG123')
    await user.type(screen.getByLabelText('Materialmenge 1'), '2')
    await user.type(await screen.findByLabelText(/Einbauort/), 'Wohnzimmer Süd')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().einbauort).toBe('Wohnzimmer Süd')
    expect(lastPostBody().materials).toEqual([{ art_nr: 'STG123', amount: 2 }])
  })

  it('schickt ohne Flag gar kein einbauort-Feld', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect('einbauort' in lastPostBody()).toBe(false)
  })
})

// ── Teilrapport (docs/specs/teilrapport.md §6.3) ──
//
// Die Checkbox hängt am Feature-Flag; das Häkchen wandert als `is_partial` in die
// Nutzlast. Ohne Flag geht das Feld GAR NICHT mit — das Backend liesse beim
// Bearbeiten sonst den Bestandswert stehen, und genau das ist gewollt: ein
// abgeschaltetes Feature darf einen bestehenden Teilrapport nicht still zum
// gewöhnlichen Rapport machen (und damit seine Verrechenbarkeit ändern).

describe('ReportCreateForm — Teilrapport', () => {
  function withTeilrapport() {
    vi.mocked(getMe).mockResolvedValue(
      { feature_flags: { teilrapport: { enabled: true } } } as never,
    )
  }

  it('zeigt die Checkbox nur mit Feature-Flag', async () => {
    renderForm([makeQuote()])
    expect(screen.queryByLabelText(/Teilrapport/)).not.toBeInTheDocument()

    withTeilrapport()
    renderForm([makeQuote()])
    expect(await screen.findByLabelText(/Teilrapport/)).toBeInTheDocument()
  })

  it('ist per Default nicht angehakt — der gewöhnliche Rapport bleibt der Normalfall', async () => {
    withTeilrapport()
    const user = userEvent.setup()
    renderForm([makeQuote()])

    const box = await screen.findByLabelText(/Teilrapport/) as HTMLInputElement
    expect(box.checked).toBe(false)

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().is_partial).toBe(false)
  })

  it('schickt is_partial, wenn der Projektleiter das Häkchen setzt', async () => {
    withTeilrapport()
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.click(await screen.findByLabelText(/Teilrapport/))
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect(lastPostBody().is_partial).toBe(true)
  })

  it('schickt ohne Flag gar kein is_partial-Feld', async () => {
    const user = userEvent.setup()
    renderForm([makeQuote()])

    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() => expect(postFired()).toBe(true))
    expect('is_partial' in lastPostBody()).toBe(false)
  })
})
