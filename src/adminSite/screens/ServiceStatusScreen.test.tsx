import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MigrationCard } from './ServiceStatusScreen'
import type { MigrationStatus } from '../../api/serviceHealth'

function stand(over: Partial<MigrationStatus> = {}): MigrationStatus {
  return {
    status: 'aktuell',
    erwartet: 312,
    angewandt: 312,
    baseline: 310,
    fehlend: [],
    letzte: [
      { version: '20261011b_neu', applied_at: new Date().toISOString(), applied_by: 'railway:db-migrate', snapshot: 's2' },
    ],
    ...over,
  }
}

describe('MigrationCard', () => {
  it('zeigt den aktuellen Stand und den letzten Lauf', () => {
    render(<MigrationCard data={stand()} />)
    expect(screen.getByText('AKTUELL')).toBeTruthy()
    expect(screen.getByText('20261011b_neu')).toBeTruthy()
    expect(screen.getByText(/davon 310 per Baseline/)).toBeTruthy()
    expect(screen.queryByText(/Noch nicht in der Datenbank/)).toBeNull()
  })

  it('nennt ausstehende Migrationen und ordnet sie als normal nach einem Merge ein', () => {
    render(<MigrationCard data={stand({ status: 'fehlend', angewandt: 311, fehlend: ['20261012_x'] })} />)
    expect(screen.getByText('1 AUSSTEHEND')).toBeTruthy()
    expect(screen.getByText(/Noch nicht in der Datenbank: 20261012_x/)).toBeTruthy()
    expect(screen.getByText(/Kurz nach einem Merge normal/)).toBeTruthy()
  })

  it('kürzt lange Listen', () => {
    const fehlend = Array.from({ length: 7 }, (_, i) => `2026101${i}_m`)
    render(<MigrationCard data={stand({ status: 'fehlend', fehlend })} />)
    expect(screen.getByText(/\(\+2 weitere\)/)).toBeTruthy()
  })

  it('ohne Tabelle: nicht eingerichtet statt einer falschen Zahl', () => {
    render(<MigrationCard data={stand({ status: 'unbekannt', angewandt: null, baseline: null, letzte: [] })} />)
    expect(screen.getByText('NICHT EINGERICHTET')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })
})
