import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { abgewiesen, RapportBotAnsicht } from './RapportBotPanel'
import type { RapportBotLage, RapportBotMandant } from '../../api/serviceHealth'

function mandant(over: Partial<RapportBotMandant> = {}): RapportBotMandant {
  return {
    mandant: 'gehlhaar',
    ampel: {
      stufe: 'gruen', text: '20 % verworfen (2 von 10, 7 Tage).', gruende: [],
      quote: 0.2, quote_basis: 0.1, zusammenfassungen: 10, zusammenfassungen_basis: 30,
      falsche_erfolgsmeldung: 0,
    },
    summen: { turn: 120, bestaetigt: 8, verworfen: 2, 'abgewiesen:datum_alt': 3, 'abgewiesen:stunden_summe': 1 },
    ...over,
  }
}

function lage(over: Partial<RapportBotLage> = {}): RapportBotLage {
  return { status: 'ok', days: 30, ampel: 'gruen', gruende: [], summen: {}, mandanten: [mandant()], ...over }
}

describe('RapportBotAnsicht', () => {
  it('grün: Betrieb mit Kurztext und Summen', () => {
    render(<RapportBotAnsicht data={lage()} />)
    expect(screen.getByTestId('rapport-bot-ampel').dataset.ampel).toBe('gruen')
    expect(screen.getByText('gehlhaar')).toBeTruthy()
    expect(screen.getByText('20 % verworfen (2 von 10, 7 Tage).')).toBeTruthy()
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()   // abgewiesen: 3 + 1
  })

  it('rot: nennt die Gründe', () => {
    const grund = 'gehlhaar: 1× Erfolg gemeldet ohne gespeicherten Rapport (7 Tage).'
    render(<RapportBotAnsicht data={lage({
      ampel: 'rot', gruende: [grund],
      mandanten: [mandant({ ampel: { ...mandant().ampel, stufe: 'rot', text: grund } })],
    })} />)
    expect(screen.getByText('Rapport-Bot: Jetzt hinschauen')).toBeTruthy()
    expect(screen.getAllByText(grund).length).toBe(2)
    expect(screen.getByText('ROT')).toBeTruthy()
  })

  it('ohne Zählung ein Hinweis statt einer leeren Tabelle', () => {
    render(<RapportBotAnsicht data={lage({ mandanten: [] })} />)
    expect(screen.getByText('Im Zeitraum keine Zählung.')).toBeTruthy()
  })

  it('nicht lesbar statt einer leeren, beruhigenden Ansicht', () => {
    render(<RapportBotAnsicht data={{ status: 'nicht_lesbar', days: 30 }} />)
    expect(screen.getByText(/Rapport-Bot-Zähler nicht lesbar/)).toBeTruthy()
    expect(screen.queryByText(/Keine Auffälligkeiten/)).toBeNull()
  })

  it('zählt nur die abgewiesen-Schlüssel', () => {
    expect(abgewiesen({ turn: 5, 'abgewiesen:a': 2, 'abgewiesen:b': 3, verworfen: 9 })).toBe(5)
    expect(abgewiesen({})).toBe(0)
  })
})
