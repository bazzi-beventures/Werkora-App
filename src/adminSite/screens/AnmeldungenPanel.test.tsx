import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnmeldeLageAnsicht } from './AnmeldungenPanel'
import type { AnmeldeKonto, AnmeldeLage } from '../../api/serviceHealth'

function konto(over: Partial<AnmeldeKonto> = {}): AnmeldeKonto {
  return {
    name: 'Anna Muster', mandant: 'muster', rolle: 'admin', art: 'passwort',
    fehlversuche: 12, fehlversuche_24h: 12, spitze_15min: 10,
    letzter: '2026-11-22T10:00:00+00:00', gesperrt: false, ...over,
  }
}

function lage(over: Partial<AnmeldeLage> = {}): AnmeldeLage {
  return {
    status: 'ok', days: 7, ampel: 'gruen', gruende: [],
    sperre: { versuche: 10, minuten: 15 },
    summen: { login_falsch: 0, login_unbekannt: 840, login_gesperrt: 0, bremse_login: 3, bremse_andere: 0 },
    tage: [], bremsen: [], konten: [], gekappt: false, ...over,
  }
}

describe('AnmeldeLageAnsicht', () => {
  it('grün: Grundrauschen ohne Alarm', () => {
    render(<AnmeldeLageAnsicht data={lage()} />)
    expect(screen.getByTestId('anmelde-ampel').dataset.ampel).toBe('gruen')
    expect(screen.getByText('Keine Auffälligkeiten')).toBeTruthy()
    expect(screen.getByText('840')).toBeTruthy()
    expect(screen.getByText('Keine im Zeitraum.')).toBeTruthy()
  })

  it('rot: nennt die Gründe und markiert das gesperrte Konto', () => {
    const grund = '«Anna Muster» (muster) ist gerade gesperrt: 10+ Fehlversuche in 15 Minuten.'
    render(<AnmeldeLageAnsicht data={lage({
      ampel: 'rot', gruende: [grund],
      konten: [konto({ gesperrt: true }), konto({ name: 'Beni', art: 'wiederherstellung', rolle: 'superadmin' })],
      bremsen: [{ name: 'pw_login', anzahl: 8, login: true }],
    })} />)
    expect(screen.getByText('Jetzt hinschauen')).toBeTruthy()
    expect(screen.getByText(grund)).toBeTruthy()
    expect(screen.getByText('GESPERRT')).toBeTruthy()
    expect(screen.getByText('Wiederherstellungscode')).toBeTruthy()
    expect(screen.getByText('Betreiber')).toBeTruthy()
    expect(screen.getByText(/pw_login 8×/)).toBeTruthy()
  })

  it('kürzt die Kontoliste', () => {
    const konten = Array.from({ length: 13 }, (_, i) => konto({ name: `K${i}` }))
    render(<AnmeldeLageAnsicht data={lage({ konten })} />)
    expect(screen.getByText('… und 3 weitere Konten.')).toBeTruthy()
    expect(screen.queryByText('K12')).toBeNull()
  })

  it('nicht lesbar statt einer leeren, beruhigenden Ansicht', () => {
    render(<AnmeldeLageAnsicht data={{ status: 'nicht_lesbar', days: 7 }} />)
    expect(screen.getByText(/Anmelde-Lage nicht lesbar/)).toBeTruthy()
    expect(screen.queryByText('Keine Auffälligkeiten')).toBeNull()
  })
})
