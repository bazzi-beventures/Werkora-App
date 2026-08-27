import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ProjectsScreen from './ProjectsScreen'
import { getProject, listProjects, listProjectLocalities } from '../../api/admin/projects'
import type { EmbeddedCustomer, Project } from '../../api/admin/projects'
import type { ProjectTab } from './projectDetail/ProjectTabBar'

// Der Sprung aus einer Info-Mail: Button «Rapport im Projekt öffnen» →
// #/admin/projects/<id>/reports → AdminApp → hier → Maske auf dem Reiter
// «Rapporte». Geprueft wird das Stueck dazwischen, das leicht kaputtgeht:
// `openProjectTab` ist eine Zeile spaeter schon wieder abgeraeumt
// (`onConsumedProjectId`), die Maske liest ihren Reiter aber nur beim Mount.
//
// Die Maske selbst ist gestubbt — sie zieht ein halbes Dutzend Endpoints, und
// geprueft wird hier die Uebergabe, nicht ihr Innenleben.
vi.mock('./ProjectDetailScreen', () => ({
  default: ({ project, initialTab }: { project: Project | null; initialTab?: ProjectTab }) =>
    <div data-testid="detail">{`${project?.id ?? '-'}:${initialTab ?? 'kein-reiter'}`}</div>,
}))

vi.mock('../../api/admin/projects', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/admin/projects')>()
  return { ...actual, listProjects: vi.fn(), getProject: vi.fn(), listProjectLocalities: vi.fn() }
})
vi.mock('../../api/admin/staff', () => ({ getAdminStaff: vi.fn().mockResolvedValue([]) }))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../api/modules', () => ({ isFeatureEnabled: () => false }))
vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }))

const mockList = vi.mocked(listProjects)
const mockGet = vi.mocked(getProject)
const mockLocalities = vi.mocked(listProjectLocalities)

const KUNDE: EmbeddedCustomer = {
  id: 'c-1', name: 'Müller AG', billing_name: null,
  address: 'Hofstettweg 5, 8405 Winterthur',
  billing_address: null, object_address: null, email: null, phone: null,
}

const PROJEKT: Project = {
  id: 'p-1', project_id_text: '261301', name: 'Leerwhg. Tösstalstr. 134',
  kind: 'project', customer_id: 'c-1', customer: KUNDE,
  object_name: null, object_address: null, art_der_arbeit: null,
  projektleiter_id: null, monteur_ids: [], kontakte: [], eigentuemer: null,
  disposal_details: null, status: 'offen', is_closed: false,
  created_at: '2026-08-19T10:00:00Z', created_by: null, created_by_id: null,
  bemerkung: null, geruestfach: null, start_date: null, end_date: null,
  start_time: null, end_time: null, quote: null, invoice: null,
}

const EMPTY = {
  rows: [], total: 0, open_count: 0, closed_count: 0, archived_count: 0, page: 1, page_size: 50,
}

beforeEach(() => {
  sessionStorage.clear()
  mockList.mockReset(); mockList.mockResolvedValue(EMPTY)
  mockGet.mockReset(); mockGet.mockResolvedValue(PROJEKT)
  mockLocalities.mockReset(); mockLocalities.mockResolvedValue([])
})

describe('ProjectsScreen — Sprung aus einer Info-Mail', () => {
  it('oeffnet die Maske auf dem verlangten Reiter', async () => {
    render(<ProjectsScreen openProjectId="p-1" openProjectTab="reports" />)
    expect(await screen.findByTestId('detail')).toHaveTextContent('p-1:reports')
  })

  it('haelt den Reiter fest, auch wenn der Prop sofort wieder abgeraeumt wird', async () => {
    // Genau das tut AdminApp: `onConsumedProjectId` loescht detailId UND den
    // Reiter. Die Maske darf davon nichts mitbekommen.
    const { rerender } = render(
      <ProjectsScreen openProjectId="p-1" openProjectTab="quotes"
                      onConsumedProjectId={() => {}} />)
    await screen.findByTestId('detail')
    rerender(<ProjectsScreen />)
    expect(screen.getByTestId('detail')).toHaveTextContent('p-1:quotes')
  })

  it('oeffnet ohne Reiter-Angabe wie bisher (Doppelklick aus der Einsatzplanung)', async () => {
    render(<ProjectsScreen openProjectId="p-1" />)
    expect(await screen.findByTestId('detail')).toHaveTextContent('p-1:kein-reiter')
  })

  it('bleibt bei der Uebersicht, wenn das Projekt nicht mehr da ist', async () => {
    mockGet.mockRejectedValue(new Error('404'))
    const consumed = vi.fn()
    render(<ProjectsScreen openProjectId="weg" openProjectTab="reports"
                           onConsumedProjectId={consumed} />)
    await waitFor(() => expect(consumed).toHaveBeenCalled())
    expect(screen.queryByTestId('detail')).toBeNull()
  })
})
