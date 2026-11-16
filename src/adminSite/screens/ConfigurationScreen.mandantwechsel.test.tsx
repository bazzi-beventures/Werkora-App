/**
 * Mandantenwechsel im Wähler bei offener Konfiguration.
 *
 * Der Wähler lässt den Screen stehen (useTenantScope.selectTenant: «Der Screen
 * bleibt, wie er ist»). Die Tabs laden aber nur beim Mount — ohne key liefen sie
 * mit dem Stand des vorigen Mandanten weiter, und «Speichern» schrieb diesen
 * Stand beim neuen Mandanten ein (bis 2026-11 bei Workflows, Modulen u.a.).
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Hält wie die echten Tabs den beim Mount geladenen Mandanten fest.
function eingefroren(name: string) {
  return function Tab({ tenantId }: { tenantId: string }) {
    const [geladen] = useState(tenantId)
    return <div>{name}:{geladen}</div>
  }
}

vi.mock('./tabs/ModulesTab', () => ({ ModulesTab: eingefroren('MODULE') }))
vi.mock('./tabs/WorkflowsTab', () => ({ WorkflowsTab: eingefroren('WORKFLOWS') }))
vi.mock('./tabs/TestingTab', () => ({ TestingTab: () => null }))
vi.mock('./tabs/TravelCostTab', () => ({ TravelCostTab: () => null }))
vi.mock('./tabs/SchedulingTab', () => ({ SchedulingTab: () => null }))
vi.mock('./tabs/HelpDocsTab', () => ({ HelpDocsTab: () => null }))
vi.mock('./tabs/MailEingangTab', () => ({ MailEingangTab: () => null }))
vi.mock('./tabs/BexioTab', () => ({ BexioTab: () => null }))
vi.mock('./tabs/ServiceBegleitungTab', () => ({ ServiceBegleitungTab: () => null }))

import ConfigurationScreen from './ConfigurationScreen'

describe('ConfigurationScreen — Mandantenwechsel', () => {
  it('baut den Tab für den neuen Mandanten neu auf und behält den Reiter', async () => {
    const { rerender } = render(<ConfigurationScreen tenantId="mandant-a" />)
    expect(screen.getByText('MODULE:mandant-a')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Workflows' }))
    expect(screen.getByText('WORKFLOWS:mandant-a')).toBeInTheDocument()

    rerender(<ConfigurationScreen tenantId="mandant-b" />)
    expect(screen.getByText('WORKFLOWS:mandant-b')).toBeInTheDocument()
    expect(screen.queryByText(/mandant-a/)).not.toBeInTheDocument()
  })
})
