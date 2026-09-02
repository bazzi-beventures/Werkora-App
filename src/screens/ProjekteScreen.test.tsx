import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen from './ProjekteScreen'
import { apiFetch, apiFormFetch } from '../api/client'
import type { UserInfo } from '../api/auth'

// Rapport-Sperre in der Mitarbeiter-PWA (Feature rapport_offerten_annahme_pflicht):
// Das Backend liefert pro Projekt `rapport_blocked`; ist es gesetzt, ist der
// Rapport-Knopf ausgegraut und ein Hinweis erklärt warum. Die eigentliche
// Durchsetzung liegt serverseitig im Rapport-Chat — hier geht es nur um die
// sichtbare Hälfte.

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  isNetworkError: () => false,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

const mockFetch = vi.mocked(apiFetch)

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'MFH Sonnhalde',
    kind: 'project',
    art_der_arbeit: ['Montage'],
    customer_id: null,
    customer: null,
    object_name: null,
    object_address: null,
    start_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
    kontakte: [],
    bemerkung: null,
    geruestfach: null,
    ...over,
  }
}

// Projektliste per GET, Detail-Ressourcen (files/comments/tasks/reports) leer,
// sofern der Test nichts anderes vorgibt.
function routeFetch(projects: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((path: string) => {
    if (path === '/pwa/projects') return Promise.resolve(projects)
    if (path in extra) return Promise.resolve(extra[path])
    return Promise.resolve([])
  })
}

function report(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    report_date: '2026-08-05',
    description: 'Storen montiert',
    created_by: 'Max Muster',
    signature_timestamp: null,
    invoice_id: null,
    invoice_locked: false,
    created_at: '2026-08-05T16:00:00Z',
    source: 'chat',
    is_own: true,
    ...over,
  }
}

const NOOP = {
  // Ohne Feature-Flags: die Teilrapport-Bedienelemente sind hier nicht das Thema.
  user: null,
  onNavHome: () => {},
  onNavRapport: () => {},
  onNavArbeitszeit: () => {},
  onNavProfile: () => {},
  onLoggedOut: () => {},
}

async function openProject(
  projects: Record<string, unknown>[],
  onStartRapport = vi.fn(),
  extra: Record<string, unknown> = {},
  userInfo: UserInfo | null = null,
) {
  const user = userEvent.setup()
  routeFetch(projects, extra)
  render(<ProjekteScreen {...NOOP} user={userInfo} onStartRapport={onStartRapport} />)

  await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
  await user.click(screen.getByText('MFH Sonnhalde'))
  const button = await screen.findByRole('button', { name: /Rapport erstellen/ })
  return { user, button, onStartRapport }
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(apiFormFetch).mockReset()
})

describe('ProjekteScreen — Rapport-Sperre', () => {
  it('sperrt den Rapport-Knopf, solange keine Offerte angenommen ist', async () => {
    const { user, button, onStartRapport } = await openProject([
      project({ rapport_blocked: true }),
    ])

    expect(button).toBeDisabled()
    expect(screen.getByText(/noch nicht angenommen/)).toBeInTheDocument()

    await user.click(button)
    expect(onStartRapport).not.toHaveBeenCalled()
  })

  it('lässt den Rapport zu, sobald eine Offerte angenommen ist', async () => {
    const { user, button, onStartRapport } = await openProject([
      project({ rapport_blocked: false }),
    ])

    expect(button).toBeEnabled()
    expect(screen.queryByText(/noch nicht angenommen/)).not.toBeInTheDocument()

    await user.click(button)
    // Mit der id, nicht nur dem Namen: zwei Liegenschaften desselben Kunden dürfen
    // gleich heissen — der Name allein liesse die Zuordnung wieder offen.
    expect(onStartRapport).toHaveBeenCalledWith({ id: 'p1', name: 'MFH Sonnhalde' })
  })

  it('behandelt ein fehlendes Feld als "nicht gesperrt" (ältere API)', async () => {
    const { button } = await openProject([project()])
    expect(button).toBeEnabled()
  })
})

// Stempel-Pflicht (Feature rapport_nur_eingestempelt): derselbe Knopf, zweiter
// Grund. Sie hängt nicht am Projekt, sondern am Benutzer — der Screen fragt dafür
// `/pwa/status` ab. Massgeblich ist auch hier der Server (der Rapport-Chat weist
// ab); getestet wird die sichtbare Hälfte.
describe('ProjekteScreen — Stempel-Pflicht', () => {
  const STEMPEL_USER = {
    authorized_user_id: 'u1',
    username: 'hans',
    display_name: 'Hans Muster',
    email: null,
    staff_id: 's1',
    staff_name: 'Hans Muster',
    tenant_id: 't1',
    role: 'user',
    consent_version: 'v1',
    consent_required: false,
    enabled_modules: ['timekeeping'],
    feature_flags: { rapport_nur_eingestempelt: { enabled: true } },
  } satisfies UserInfo

  function zeitStatus(status: 'active' | 'inactive') {
    return { '/pwa/status': { status, clock_in: null, since_minutes: 0 } }
  }

  it('sperrt den Rapport-Knopf, solange nicht eingestempelt ist', async () => {
    const { user, button, onStartRapport } = await openProject(
      [project()], vi.fn(), zeitStatus('inactive'), STEMPEL_USER,
    )

    await waitFor(() => expect(button).toBeDisabled())
    expect(screen.getByText(/nicht eingestempelt/)).toBeInTheDocument()

    await user.click(button)
    expect(onStartRapport).not.toHaveBeenCalled()
  })

  it('gibt den Knopf frei, sobald eingestempelt ist', async () => {
    const { button } = await openProject(
      [project()], vi.fn(), zeitStatus('active'), STEMPEL_USER,
    )

    expect(button).toBeEnabled()
    expect(screen.queryByText(/nicht eingestempelt/)).not.toBeInTheDocument()
  })

  it('sperrt den Superadmin nicht — er ist in keinem Mandanten eingestempelt', async () => {
    const { button } = await openProject(
      [project()], vi.fn(), zeitStatus('inactive'),
      { ...STEMPEL_USER, role: 'superadmin' },
    )

    expect(button).toBeEnabled()
  })

  it('sperrt nicht ohne das Modul Zeiterfassung — dort gibt es keinen Stempel', async () => {
    const { button } = await openProject(
      [project()], vi.fn(), zeitStatus('inactive'),
      { ...STEMPEL_USER, enabled_modules: [] },
    )

    expect(button).toBeEnabled()
  })
})


// Die Kachelliste zeigt den neuesten Tag oben (Altes rutscht nach unten), einen
// einzelnen Tag aber weiter als Tagesablauf von oben nach unten. Sie übernahm
// früher die Server-Reihenfolge, in der die Einsätze eines Tages nach Namen
// standen (11:00 vor 09:00 vor 16:00).
describe('ProjekteScreen — Reihenfolge der Einsätze', () => {
  function tileNames(container: HTMLElement): (string | null)[] {
    return Array.from(container.querySelectorAll('.projekte-tile-name')).map(el => el.textContent)
  }

  it('ordnet die Einsätze eines Tages nach Startzeit', async () => {
    routeFetch([
      project({ id: 'a', name: 'Müller Kleinandelfingen', start_date: '2026-08-13', start_time: '11:00:00' }),
      project({ id: 'b', name: 'Siegrist Wiesendangen', start_date: '2026-08-13', start_time: '09:00:00' }),
      project({ id: 'c', name: 'Walch Seuzach', start_date: '2026-08-13', start_time: '16:00:00' }),
    ])
    const { container } = render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Walch Seuzach')).toBeInTheDocument())
    expect(tileNames(container)).toEqual([
      'Siegrist Wiesendangen', 'Müller Kleinandelfingen', 'Walch Seuzach',
    ])
  })

  it('gruppiert nach Tag, neuester Tag oben, ohne Termin ans Ende', async () => {
    routeFetch([
      project({ id: 'a', name: 'Noch nicht disponiert', start_date: null, start_time: null }),
      project({ id: 'b', name: 'Heute früh', start_date: '2026-08-14', start_time: '07:00:00' }),
      project({ id: 'c', name: 'Gestern spät', start_date: '2026-08-13', start_time: '17:00:00' }),
    ])
    const { container } = render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Noch nicht disponiert')).toBeInTheDocument())
    expect(tileNames(container)).toEqual(['Heute früh', 'Gestern spät', 'Noch nicht disponiert'])
    expect(screen.getByText('13.08.2026')).toBeInTheDocument()
    expect(screen.getByText('14.08.2026')).toBeInTheDocument()
    expect(screen.getByText('Ohne Termin')).toBeInTheDocument()
  })
})

// Der Fallback selbst liegt im Backend (db.project_contacts_with_customer_fallback) —
// hier zählt nur, dass der abgeleitete Eintrag als solcher gekennzeichnet wird und der
// Monteur nicht denkt, jemand habe diese Person für die Baustelle benannt.
describe('ProjekteScreen — Kontakt aus dem Kundenstamm', () => {
  it('kennzeichnet einen vom Kunden abgeleiteten Kontakt', async () => {
    await openProject([project({
      kontakte: [{
        name: 'Muster AG', kommentar: 'Kunde', telefon: '079 111 22 33',
        email: 'info@muster.ch', is_site_contact: false, from_customer: true,
      }],
    })])

    expect(screen.getByText('Muster AG')).toBeInTheDocument()
    expect(screen.getByText(/keine Ansprechperson hinterlegt/)).toBeInTheDocument()
  })

  it('zeigt bei einer echten Ansprechperson deren Kommentar', async () => {
    await openProject([project({
      kontakte: [{ name: 'Herr Meier', kommentar: 'Bauleiter', telefon: '079 5', email: '' }],
    })])

    expect(screen.getByText('Bauleiter')).toBeInTheDocument()
    expect(screen.queryByText(/keine Ansprechperson hinterlegt/)).not.toBeInTheDocument()
  })
})

// Adressen sind Kartenlinks: der Monteur tippt sie an und landet in der Navigation,
// statt sie abzutippen.
describe('ProjekteScreen — Adressen als Kartenlink', () => {
  function customer(over: Record<string, unknown> = {}) {
    return {
      id: 'c1', name: 'Muster AG', billing_name: null, address: null,
      billing_address: null, object_address: null, email: null, phone: null,
      ...over,
    }
  }

  it('verlinkt die Objektadresse auf Google Maps', async () => {
    await openProject([project({ object_address: 'Bahnhofstrasse 1, 8001 Zürich' })])

    const link = screen.getByRole('link', { name: /Bahnhofstrasse 1, 8001 Zürich in Google Maps/ })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Bahnhofstrasse%201%2C%208001%20Z%C3%BCrich',
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('zeigt die Kundenadresse zusätzlich, wenn sie von der Objektadresse abweicht', async () => {
    await openProject([project({
      object_address: 'Baustelle 5, 8001 Zürich',
      customer: customer({ address: 'Büroweg 2, 6000 Luzern' }),
    })])

    expect(screen.getByText('Kundenadresse')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Büroweg 2, 6000 Luzern in Google Maps/ })).toBeInTheDocument()
  })

  it('lässt die Kundenadresse weg, wenn sie mit der Objektadresse identisch ist', async () => {
    await openProject([project({
      object_address: 'Baustelle 5, 8001 Zürich',
      customer: customer({ address: 'Baustelle 5, 8001 Zürich' }),
    })])

    expect(screen.queryByText('Kundenadresse')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Baustelle 5, 8001 Zürich in Google Maps/ })).toHaveLength(1)
  })

  it('fällt ohne Projekt-Objektadresse auf die des Kunden zurück', async () => {
    await openProject([project({
      object_address: null,
      customer: customer({ object_address: 'Objektweg 9, 3000 Bern' }),
    })])

    expect(screen.getByRole('link', { name: /Objektweg 9, 3000 Bern in Google Maps/ })).toBeInTheDocument()
  })
})

// Rapporte des Projekts im Detail: der Monteur soll sehen, was erfasst wurde — auch
// von Kollegen — und das PDF öffnen können. Löschen bleibt auf eigene, unsignierte
// und unverrechnete Rapporte beschränkt (der Server prüft dieselben Regeln nochmals).
describe('ProjekteScreen — Rapporte des Projekts', () => {
  const REPORTS_PATH = '/pwa/projects/p1/reports'

  it('listet den erfassten Rapport mit Ansehen-Knopf', async () => {
    await openProject([project()], vi.fn(), { [REPORTS_PATH]: [report()] })

    expect(await screen.findByText('Rapporte')).toBeInTheDocument()
    expect(screen.getByText('05.08.2026')).toBeInTheDocument()
    expect(screen.getByText('Storen montiert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ansehen/ })).toBeInTheDocument()
  })

  it('zeigt den Rapport eines Kollegen ohne Löschen-Knopf', async () => {
    await openProject([project()], vi.fn(), {
      [REPORTS_PATH]: [report({ is_own: false, created_by: 'Anna Beispiel' })],
    })

    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ansehen/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('sperrt das Löschen des eigenen Rapports, sobald er unterschrieben ist', async () => {
    await openProject([project()], vi.fn(), {
      [REPORTS_PATH]: [report({ signature_timestamp: '2026-08-05T17:00:00Z' })],
    })

    expect(await screen.findByText('unterschrieben')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('lässt den eigenen, unsignierten Rapport löschen', async () => {
    await openProject([project()], vi.fn(), { [REPORTS_PATH]: [report()] })

    expect(await screen.findByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })

  // Ein pendenter Rapport wird von der Rechnungsaggregation stillschweigend
  // mitverrechnet. Solange die Rechnung den Kunden nicht erreicht hat, bleibt die
  // Unterschrift nachtragbar — sonst wäre der Rapport für immer ohne Abnahme.
  it('lässt die Unterschrift nachtragen, solange die Rechnung offen ist', async () => {
    await openProject([project()], vi.fn(), {
      [REPORTS_PATH]: [report({ invoice_id: 10, invoice_locked: false })],
    })

    expect(await screen.findByText('auf offener Rechnung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unterschrift/ })).toBeInTheDocument()
    // Gelöscht wird trotzdem nicht: die Positionen stehen schon auf der Rechnung.
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('nimmt keine Unterschrift mehr, sobald die Rechnung beim Kunden ist', async () => {
    await openProject([project()], vi.fn(), {
      [REPORTS_PATH]: [report({ invoice_id: 10, invoice_locked: true })],
    })

    expect(await screen.findByText('abgerechnet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unterschrift/ })).not.toBeInTheDocument()
  })
})

// Lieferscheine: der Teilordner "Lieferschein" aus dem Admin-Reiter
// Lieferantendokumente steht auch dem Monteur zur Verfügung — als eigene Karte,
// damit der Lieferschein vom Büro nicht zwischen den Baustellenfotos untergeht.
// Die übrigen Lieferantendokumente (Angebot, Bestellung, Auftragsbestätigung)
// filtert der Server aus der Liste (ADMIN_ONLY_FILE_CATEGORIES) — hier kommen sie
// gar nicht erst an.
describe('ProjekteScreen — Lieferscheine', () => {
  const FILES_PATH = '/pwa/projects/p1/files'

  function file(over: Record<string, unknown> = {}) {
    return {
      id: 'f1',
      filename: 'lieferschein.pdf',
      storage_path: 'tenant/project_files/p1/ls.pdf',
      mime_type: 'application/pdf',
      category: 'lieferschein',
      created_at: '2026-08-05T09:00:00Z',
      ...over,
    }
  }

  it('zeigt den vom Büro abgelegten Lieferschein als Download in eigener Karte', async () => {
    await openProject([project()], vi.fn(), { [FILES_PATH]: [file()] })

    expect(await screen.findByText('Lieferscheine')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'lieferschein.pdf' })
    expect(link).toHaveAttribute('href', '/pwa/projects/p1/files/f1/download')
    // Nicht doppelt: die Sammelliste zeigt nur noch den Rest.
    expect(screen.getByText('Noch keine Dateien hochgeladen.')).toBeInTheDocument()
  })

  it('lässt die Sammelliste unberührt und meldet den leeren Lieferschein-Ordner', async () => {
    await openProject([project()], vi.fn(), {
      [FILES_PATH]: [file({ id: 'f2', filename: 'baustelle.jpg', category: 'fotos', mime_type: 'image/jpeg' })],
    })

    expect(await screen.findByText('baustelle.jpg')).toBeInTheDocument()
    expect(screen.getByText('Noch kein Lieferschein vorhanden.')).toBeInTheDocument()
  })

  it('lädt über den Lieferschein-Knopf in die Kategorie lieferschein hoch', async () => {
    const { user } = await openProject([project()], vi.fn(), { [FILES_PATH]: [] })

    const input = await screen.findByLabelText('Lieferschein hochladen')
    await user.upload(input, new File(['%PDF'], 'ls.pdf', { type: 'application/pdf' }))

    await waitFor(() => expect(apiFormFetch).toHaveBeenCalled())
    const [path, form] = vi.mocked(apiFormFetch).mock.calls[0] as [string, FormData]
    expect(path).toBe(FILES_PATH)
    expect(form.get('category')).toBe('lieferschein')
  })
})

// ── Wochenplan-Ansicht ─────────────────────────────────────────────────────
// Der Wochenplan hat den Zeitstrahl als zweite Ansicht abgelöst. Entscheidend
// ist, dass er sich nicht wie ein fremder Bildschirm verhält: ein Einsatz muss
// dasselbe Projekt öffnen wie die Kachel daneben.

// Mandant MIT Einsatzplanung. `user` trägt in dieser Maske nur Modul- und
// Feature-Flags; der Rest von UserInfo spielt hier keine Rolle.
const USER_MIT_PLANUNG = { enabled_modules: ['scheduling'] } as unknown as typeof NOOP.user

function scheduleWeek(entries: Record<string, unknown>[]) {
  const days = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30']
  return {
    week_start: '2026-08-24',
    week_end: '2026-08-30',
    week_number: 35,
    week_label: '24.08. – 30.08.2026',
    has_any: entries.length > 0,
    days: days.map((iso, i) => ({
      iso,
      weekday: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][i],
      date: `${iso.slice(8)}.${iso.slice(5, 7)}.2026`,
      short: `${iso.slice(8)}.${iso.slice(5, 7)}.`,
      entries: iso === '2026-08-26' ? entries : [],
    })),
  }
}

function scheduleEntry(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    appointment_id: 'a1',
    name: 'MFH Sonnhalde',
    kind: 'project',
    is_internal: false,
    art_der_arbeit: 'Montage',
    time_label: '07:30–12:00',
    termin_kind: 'montage',
    termin_label: null,
    customer_name: 'Sonnhalde AG',
    object_address: '',
    billing_address: '',
    phone: '',
    local_contact_name: '',
    monteur_names: ['Max Muster'],
    bemerkung: '',
    is_multi_day: false,
    ...over,
  }
}

describe('ProjekteScreen — Wochenplan als zweite Ansicht', () => {
  beforeEach(() => {
    // Mittwoch, 26.08.2026.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 26, 9, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderMitPlanung(entries = [scheduleEntry()]) {
    mockFetch.mockImplementation((path: string) => {
      if (path === '/pwa/projects') return Promise.resolve([project()])
      if (path.startsWith('/pwa/schedule/week')) return Promise.resolve(scheduleWeek(entries))
      return Promise.resolve([])
    })
    return {
      user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
      ...render(<ProjekteScreen {...NOOP} user={USER_MIT_PLANUNG} onStartRapport={vi.fn()} />),
    }
  }

  it('bietet den Umschalter Kacheln/Wochenplan an — den Zeitstrahl nicht mehr', async () => {
    renderMitPlanung()

    expect(await screen.findByRole('button', { name: /Wochenplan/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kacheln/ })).toBeInTheDocument()
    expect(screen.queryByText('Zeitstrahl')).not.toBeInTheDocument()
  })

  it('bleibt ohne Modul Einsatzplanung bei den Kacheln, ganz ohne Umschalter', async () => {
    mockFetch.mockImplementation((path: string) => {
      if (path === '/pwa/projects') return Promise.resolve([project()])
      return Promise.resolve([])
    })
    render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Wochenplan/ })).not.toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/pwa/schedule/week'))
  })

  it('öffnet beim Tippen auf einen Einsatz dieselbe Projektmaske wie eine Kachel', async () => {
    const { user } = renderMitPlanung()

    await user.click(await screen.findByRole('button', { name: /Wochenplan/ }))
    const karte = await screen.findByRole('button', { name: /MFH Sonnhalde/ })
    await user.click(karte)

    // Die Projektmaske erkennt man am Rapport-Knopf — genau das, was auch das
    // Tippen auf eine Kachel zeigt.
    expect(await screen.findByRole('button', { name: /Rapport erstellen/ })).toBeInTheDocument()
  })
})

// ── Gleichnamige Projekte auseinanderhalten ─────────────────────────────────
// Projektnamen dürfen sich doppeln (zwei Liegenschaften desselben Kunden). Ohne
// die Projektnummer stehen dann zwei identische Kacheln untereinander und der
// Monteur tippt auf gut Glück — im Normalfall soll sie aber wegbleiben.

describe('ProjekteScreen – Projektnummer bei gleichnamigen Projekten', () => {
  it('zeigt die Nummer auf beiden Kacheln, wenn zwei Projekte gleich heissen', async () => {
    routeFetch([
      project({ id: 'a', name: 'Büchel Seuzach', project_id_text: '2600559' }),
      project({ id: 'b', name: 'Büchel Seuzach', project_id_text: '2600387' }),
    ])
    render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)

    await waitFor(() => expect(screen.getAllByText('Büchel Seuzach')).toHaveLength(2))
    expect(screen.getByText('Nr. 2600559')).toBeInTheDocument()
    expect(screen.getByText('Nr. 2600387')).toBeInTheDocument()
  })

  it('lässt die Nummer weg, solange der Name eindeutig ist', async () => {
    routeFetch([
      project({ id: 'a', name: 'Büchel Seuzach', project_id_text: '2600559' }),
      project({ id: 'b', name: 'Walch Seuzach', project_id_text: '2600387' }),
    ])
    render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Büchel Seuzach')).toBeInTheDocument())
    expect(screen.queryByText(/^Nr\. /)).not.toBeInTheDocument()
  })

  it('zeigt die Nummer im Detail immer — der Rapport-Bot fragt danach', async () => {
    const user = userEvent.setup()
    routeFetch([project({ id: 'a', name: 'Büchel Seuzach', project_id_text: '2600559' })])
    render(<ProjekteScreen {...NOOP} onStartRapport={vi.fn()} />)

    await user.click(await screen.findByText('Büchel Seuzach'))
    expect(await screen.findByText('Projekt-Nr. 2600559')).toBeInTheDocument()
  })
})
