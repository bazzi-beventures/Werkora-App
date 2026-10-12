import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowsTab } from './WorkflowsTab'
import { foldSearch, matchesWorkflowSearch } from './workflowSearch'
import type { FeatureRegistryEntry } from '../../../api/admin'

const getFeatures = vi.fn()

vi.mock('../../tenantScopedApi', () => ({
  getFeatures: () => getFeatures(),
  setFeature: vi.fn(),
}))

const MANDANT = '11111111-1111-1111-1111-111111111111'

const eintrag = (over: Partial<FeatureRegistryEntry>): FeatureRegistryEntry => ({
  key: 'x', label: 'X', description: '', category: 'Rapport',
  default: {}, schema: [{ key: 'enabled', label: 'Aktiv', type: 'bool' }], ...over,
})

const PAUSE = eintrag({
  key: 'automatische_pause', label: 'Automatischer Pausenabzug',
  description: 'Zieht die gesetzliche Pause ab.', category: 'Zeiterfassung',
  schema: [
    { key: 'enabled', label: 'Aktiv', type: 'bool' },
    { key: 'minuten', label: 'Pausendauer in Minuten', type: 'number' },
  ],
})
const KLEINMAT = eintrag({
  key: 'kleinmaterial_prompt', label: 'Klein-/Schmiermaterial beim Rapport abfragen',
  description: 'Fragt beim Rapport nach Verbrauchsmaterial.',
})
const CHATBOT = eintrag({
  key: 'chatbot_material_abfrage', label: 'Chatbot: Material im Rapport abfragen',
})

describe('matchesWorkflowSearch', () => {
  it('leere Suche trifft alles', () => {
    expect(matchesWorkflowSearch(PAUSE, '   ')).toBe(true)
  })

  it('findet über Titel, Schlüssel, Beschreibung, Kategorie und Parameter', () => {
    expect(matchesWorkflowSearch(PAUSE, 'pausenabzug')).toBe(true)
    expect(matchesWorkflowSearch(PAUSE, 'automatische_pause')).toBe(true)
    expect(matchesWorkflowSearch(PAUSE, 'gesetzliche')).toBe(true)
    expect(matchesWorkflowSearch(PAUSE, 'zeiterfassung')).toBe(true)
    expect(matchesWorkflowSearch(PAUSE, 'minuten')).toBe(true)
    expect(matchesWorkflowSearch(PAUSE, 'rapport')).toBe(false)
  })

  it('Unterstrich und Leerzeichen sind gleich, Gross/Klein egal', () => {
    expect(matchesWorkflowSearch(PAUSE, 'Automatische Pause')).toBe(true)
    expect(matchesWorkflowSearch(KLEINMAT, 'KLEINMATERIAL PROMPT')).toBe(true)
  })

  it('mehrere Wörter müssen alle vorkommen, Reihenfolge egal', () => {
    expect(matchesWorkflowSearch(CHATBOT, 'rapport chatbot')).toBe(true)
    expect(matchesWorkflowSearch(KLEINMAT, 'rapport chatbot')).toBe(false)
  })

  it('faltet Akzente', () => {
    expect(foldSearch('Gerüst')).toBe('gerust')
    expect(matchesWorkflowSearch(eintrag({ label: 'Gerüstbau' }), 'gerust')).toBe(true)
  })
})

describe('WorkflowsTab — Suche', () => {
  beforeEach(() => {
    getFeatures.mockReset().mockResolvedValue({
      categories: ['Zeiterfassung', 'Rapport'],
      registry: [PAUSE, KLEINMAT, CHATBOT],
      effective: { automatische_pause: { enabled: true }, kleinmaterial_prompt: { enabled: true } },
      overrides: {},
    })
  })

  it('blendet nicht passende Einträge und leere Kategorien aus', async () => {
    render(<WorkflowsTab tenantId={MANDANT} />)
    const suche = await screen.findByLabelText('Workflows durchsuchen')
    fireEvent.change(suche, { target: { value: 'chatbot' } })
    expect(screen.getByText(/Chatbot: Material im Rapport/)).toBeTruthy()
    expect(screen.queryByText(/Automatischer Pausenabzug/)).toBeNull()
    expect(screen.queryByText(/Klein-\/Schmiermaterial/)).toBeNull()
    expect(screen.queryByText('Zeiterfassung')).toBeNull()
    expect(screen.getByText('1 von 3')).toBeTruthy()
  })

  it('«x von y aktiv» zählt weiter die ganze Kategorie', async () => {
    render(<WorkflowsTab tenantId={MANDANT} />)
    const suche = await screen.findByLabelText('Workflows durchsuchen')
    fireEvent.change(suche, { target: { value: 'chatbot' } })
    expect(screen.getByText('1 von 2 aktiv')).toBeTruthy()
  })

  it('meldet, wenn nichts passt, und Escape leert die Suche', async () => {
    render(<WorkflowsTab tenantId={MANDANT} />)
    const suche = await screen.findByLabelText('Workflows durchsuchen')
    fireEvent.change(suche, { target: { value: 'gibtsnicht' } })
    expect(screen.getByText(/Kein Workflow passt/)).toBeTruthy()
    fireEvent.keyDown(suche, { key: 'Escape' })
    expect(screen.getByText(/Automatischer Pausenabzug/)).toBeTruthy()
    expect(screen.getByText(/Chatbot: Material im Rapport/)).toBeTruthy()
  })
})
