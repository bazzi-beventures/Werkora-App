/**
 * Was hier geprüft wird, ist nicht «React kann Fehlergrenzen» — sondern die
 * zwei Eigenschaften, wegen derer die Grenze existiert: die Shell daneben
 * bleibt stehen, und ein Screenwechsel macht den kaputten Bereich wieder
 * brauchbar. Die zweite ist die, die man leicht vergisst: React setzt eine
 * Fehlergrenze von sich aus **nie** zurück.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ScreenBoundary from './ScreenBoundary'

function Kaputt(): never {
  throw new Error('t.map is not a function')
}

function Heil() {
  return <div>Inhalt des Screens</div>
}

describe('ScreenBoundary', () => {
  beforeEach(() => {
    // React schreibt den Fehler zusätzlich selbst in die Konsole; das Rauschen
    // gehört nicht in die Testausgabe.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('zeigt die Meldung mit Screen-Name und Fehlertext statt einer leeren Seite', () => {
    render(
      <ScreenBoundary resetKey="fehler" screenTitel="Error-Logs">
        <Kaputt />
      </ScreenBoundary>,
    )
    expect(screen.getByText(/«Error-Logs» konnte nicht angezeigt werden/)).toBeTruthy()
    expect(screen.getByText('t.map is not a function')).toBeTruthy()
  })

  it('faengt den Absturz ab, statt ihn nach oben durchzureichen', () => {
    // Wuerfe es weiter, risse es in AdminSite die ganze Seite ab — genau der
    // Fall, den es zu verhindern gilt.
    expect(() => render(
      <ScreenBoundary resetKey="fehler" screenTitel="Error-Logs">
        <Kaputt />
      </ScreenBoundary>,
    )).not.toThrow()
  })

  it('wird beim Screenwechsel zurueckgesetzt', () => {
    const { rerender } = render(
      <ScreenBoundary resetKey="fehler" screenTitel="Error-Logs">
        <Kaputt />
      </ScreenBoundary>,
    )
    expect(screen.queryByText('Inhalt des Screens')).toBeNull()

    rerender(
      <ScreenBoundary resetKey="support" screenTitel="Support">
        <Heil />
      </ScreenBoundary>,
    )
    expect(screen.getByText('Inhalt des Screens')).toBeTruthy()
  })

  it('kann denselben Screen nochmal versuchen', () => {
    // Derselbe `resetKey`: ein vorübergehender Fehler (eine Antwort, die einmal
    // unvollständig kam) soll sich ohne Neuladen der Seite abschütteln lassen.
    let kaputt = true
    function Wackelig() {
      if (kaputt) throw new Error('einmalig')
      return <div>Inhalt des Screens</div>
    }
    render(
      <ScreenBoundary resetKey="fehler" screenTitel="Error-Logs">
        <Wackelig />
      </ScreenBoundary>,
    )
    kaputt = false
    fireEvent.click(screen.getByText('Nochmal versuchen'))
    expect(screen.getByText('Inhalt des Screens')).toBeTruthy()
  })
})
