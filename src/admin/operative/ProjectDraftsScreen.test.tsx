import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjectDraftsScreen from './ProjectDraftsScreen'
import { apiFetch } from '../../api/client'
import { convertProjectDraft, getAdminProjectDrafts, ProjectDraft } from '../../api/projectDrafts'
import { SK } from '../../api/storageKeys'

// Nur Netzwerk mocken — Kundenzuordnung und Formularlogik bleiben echt.
vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  apiUrl: (path: string) => path,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../api/projectDrafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/projectDrafts')>()),
  getAdminProjectDrafts: vi.fn(),
  convertProjectDraft: vi.fn(),
  rejectProjectDraft: vi.fn(),
}))

const mockFetch = vi.mocked(apiFetch)
const mockList = vi.mocked(getAdminProjectDrafts)
const mockConvert = vi.mocked(convertProjectDraft)

const DRAFT = {
  id: 'd-1',
  tenant_id: 't-1',
  created_by_staff_id: 's-1',
  created_by_name: 'Hans Monteur',
  status: 'open' as const,
  converted_to_project_id: null,
  decision_note: null,
  decided_at: null,
  created_at: '2026-08-14T08:00:00Z',
  updated_at: '2026-08-14T08:00:00Z',
  customer_name: 'Baumgartner Rolf und Sandra',
  customer_phone: '+41 52 315 44 91',
  customer_email: null,
  customer_address: 'Mühleweg 24, 8413 Neftenbach',
  title: 'Lamisol 90 Gekoppelt',
  description: null,
  object_name: null,
  object_address: null,
  materials: [],
  notes: null,
  art_der_arbeit: ['Neumontage' as const],
}

/** Minimal-Konto für den Screen: das Anfrageformular ist standardmässig aus. */
const USER = {
  authorized_user_id: 'u-1',
  username: 'admin',
  display_name: 'Admin',
  role: 'admin',
  enabled_modules: [],
  feature_flags: {},
} as unknown as Parameters<typeof ProjectDraftsScreen>[0]['user']

// Der Stammkunde, der früher per Teilstring auf jeden Entwurf passte.
const JUNK_CUSTOMER = {
  id: 'c-junk', name: 'A', email: null, phone: null,
  address: 'Ort Seuzach (SG) – Nesslau',
}
const REAL_CUSTOMER = {
  id: 'c-real', name: 'Baumgartner', email: null, phone: null, address: 'Neftenbach',
}

function setup(customers: unknown[], draft: ProjectDraft = DRAFT) {
  mockList.mockResolvedValue([draft])
  mockConvert.mockResolvedValue({ status: 'success', project_id: 'p-1', project_name: draft.title })
  mockFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/pwa/admin/customers')) {
      return init?.method === 'POST' ? { id: 'c-neu' } : customers
    }
    return {}
  })
}

async function openDraft() {
  render(<ProjectDraftsScreen user={USER} />)
  fireEvent.click(await screen.findByText('Lamisol 90 Gekoppelt'))
  // Warten, bis der Kundenstamm da ist — erst dann steht die Vorauswahl fest.
  await waitFor(() => expect(mockFetch).toHaveBeenCalled())
}

/** Die Leistungsart steht zweimal im Dialog: als Info des Monteurs und als Chip. */
function chip(label: string): HTMLElement {
  const hit = screen.getAllByText(label).find(el => el.tagName === 'LABEL')
  if (!hit) throw new Error(`Kein Chip mit Label "${label}"`)
  return hit
}

describe('ProjectDraftsScreen — Kundenzuordnung', () => {
  beforeEach(() => vi.clearAllMocks())

  it('wählt einen Ein-Buchstaben-Kunden nicht vor', async () => {
    setup([JUNK_CUSTOMER])
    await openDraft()

    // 'Neuen Kunden anlegen' bleibt aktiv, es gibt keinen Vorschlagsbanner.
    expect(screen.getByText('Name *')).toBeInTheDocument()
    expect(screen.queryByText(/Möglicher Treffer im Kundenstamm/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Projekt erstellen'))
    await waitFor(() => expect(mockConvert).toHaveBeenCalled())
    // Der neue Kunde wurde angelegt — nicht der Zufallstreffer verknüpft.
    expect(mockConvert.mock.calls[0][1].customer_id).toBe('c-neu')
  })

  it('schlägt einen ähnlichen Kunden vor, übernimmt ihn aber erst auf Klick', async () => {
    setup([JUNK_CUSTOMER, REAL_CUSTOMER])
    await openDraft()

    const banner = await screen.findByText(/Möglicher Treffer im Kundenstamm/)
    expect(banner).toHaveTextContent('Baumgartner')
    fireEvent.click(banner)

    fireEvent.click(screen.getByText('Projekt erstellen'))
    await waitFor(() => expect(mockConvert).toHaveBeenCalled())
    expect(mockConvert.mock.calls[0][1].customer_id).toBe('c-real')
  })

  it('wählt den namensgleichen Kunden ohne Klick vor', async () => {
    setup([{ ...REAL_CUSTOMER, name: 'Baumgartner Rolf und Sandra' }])
    await openDraft()

    await waitFor(() =>
      expect(screen.queryByText(/Möglicher Treffer im Kundenstamm/)).not.toBeInTheDocument(),
    )
    fireEvent.click(screen.getByText('Projekt erstellen'))
    await waitFor(() => expect(mockConvert).toHaveBeenCalled())
    expect(mockConvert.mock.calls[0][1].customer_id).toBe('c-real')
    // Kein neuer Kunde angelegt.
    expect(mockFetch.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(0)
  })
})

describe('ProjectDraftsScreen — Art der Arbeit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('übernimmt die vom Monteur erfasste Leistungsart', async () => {
    setup([])
    await openDraft()

    fireEvent.click(screen.getByText('Projekt erstellen'))
    await waitFor(() => expect(mockConvert).toHaveBeenCalled())
    expect(mockConvert.mock.calls[0][1].art_der_arbeit).toEqual(['Neumontage'])
  })

  it('lässt den Projektleiter die Leistungsart ergänzen', async () => {
    setup([])
    await openDraft()

    fireEvent.click(chip('Service / Wartung'))
    fireEvent.click(screen.getByText('Projekt erstellen'))
    await waitFor(() => expect(mockConvert).toHaveBeenCalled())
    // Kanonische Reihenfolge, nicht Klickreihenfolge.
    expect(mockConvert.mock.calls[0][1].art_der_arbeit).toEqual(['Neumontage', 'Wartung'])
  })

  it('sendet eine leere Liste, wenn der Projektleiter alles abwählt', async () => {
    setup([])
    await openDraft()

    fireEvent.click(chip('Neumontage'))
    fireEvent.click(screen.getByText('Projekt erstellen'))
    await waitFor(() => expect(mockConvert).toHaveBeenCalled())
    expect(mockConvert.mock.calls[0][1].art_der_arbeit).toEqual([])
  })
})

describe('ProjectDraftsScreen — Herkunft eines Entwurfs', () => {
  // Der Slug landet im localStorage; ohne Aufräumen hinge das Ergebnis daran,
  // dass dieser Block der letzte in der Datei ist.
  beforeEach(() => { vi.clearAllMocks(); localStorage.removeItem(SK.TENANT_SLUG) })
  afterEach(() => localStorage.removeItem(SK.TENANT_SLUG))

  const OEFFENTLICH = {
    ...DRAFT,
    source: 'public' as const,
    created_by_staff_id: null,
    created_by_name: 'Öffentliche Anfrage',
  }

  it('markiert eine öffentliche Anfrage in der Liste', async () => {
    setup([], OEFFENTLICH)
    render(<ProjectDraftsScreen user={USER} />)

    expect(await screen.findByText('Öffentliche Anfrage')).toBeInTheDocument()
    // Kein «Erfasst von …» — es hat sie niemand aus dem Betrieb erfasst.
    expect(screen.queryByText(/Erfasst von/)).not.toBeInTheDocument()
  })

  it('warnt im Detail vor ungeprüften Angaben', async () => {
    setup([], OEFFENTLICH)
    render(<ProjectDraftsScreen user={USER} />)
    fireEvent.click(await screen.findByText('Lamisol 90 Gekoppelt'))

    expect(screen.getByText(/Ungeprüfte Angaben von aussen/)).toBeInTheDocument()
    expect(screen.getByText('Kunde (Angaben des Absenders)')).toBeInTheDocument()
  })

  it('lässt den Mitarbeiter-Entwurf unverändert', async () => {
    setup([], DRAFT)
    render(<ProjectDraftsScreen user={USER} />)
    fireEvent.click(await screen.findByText('Lamisol 90 Gekoppelt'))

    expect(screen.queryByText(/Ungeprüfte Angaben von aussen/)).not.toBeInTheDocument()
    expect(screen.getByText('Kunde (vom Mitarbeiter erfasst)')).toBeInTheDocument()
  })

  it('zeigt die Formular-Adresse erst, wenn der Mandant das Feature einschaltet', async () => {
    setup([], DRAFT)
    localStorage.setItem(SK.TENANT_SLUG, 'musterbau')

    const { unmount } = render(<ProjectDraftsScreen user={USER} />)
    expect(await screen.findByText('Lamisol 90 Gekoppelt')).toBeInTheDocument()
    expect(screen.queryByText('Öffentliches Anfrageformular')).not.toBeInTheDocument()
    unmount()

    const mitFeature = {
      ...USER,
      feature_flags: { oeffentliche_projektanfrage: { enabled: true } },
    } as typeof USER
    render(<ProjectDraftsScreen user={mitFeature} />)
    expect(await screen.findByText('Öffentliches Anfrageformular')).toBeInTheDocument()
    expect(screen.getByText(/\/anfrage\/musterbau$/)).toBeInTheDocument()
    // Ohne freigegebene Adresse kein Einbett-Code — er wäre eine Anleitung zu
    // einem Rahmen, den das Backend mit X-Frame-Options: DENY leer lässt.
    expect(screen.queryByText('Einbett-Code kopieren')).not.toBeInTheDocument()
  })

  it('zeigt den Einbett-Code erst mit freigegebener Adresse', async () => {
    setup([], DRAFT)
    localStorage.setItem(SK.TENANT_SLUG, 'musterbau')

    const mitEinbetten = {
      ...USER,
      feature_flags: {
        oeffentliche_projektanfrage: {
          enabled: true,
          einbetten_erlaubt_auf: 'https://muster-storen.ch',
        },
      },
    } as typeof USER
    render(<ProjectDraftsScreen user={mitEinbetten} />)

    expect(await screen.findByText('Einbett-Code kopieren')).toBeInTheDocument()
    expect(screen.getByText(/^<iframe src="http.*\/anfrage\/musterbau"/)).toBeInTheDocument()
  })
})
