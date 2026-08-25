import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HelpBubble from './HelpBubble'

// HelpBot lädt beim Mount Daten — für den Blase-/Drag-Test irrelevant, also stubben.
vi.mock('./HelpBot', () => ({ default: () => <div data-testid="helpbot" /> }))

// Muss zu den Konstanten in HelpBubble.tsx passen.
const FAB = 56
const MARGIN = 12
const BOTTOM_RESERVE = 72
const POS_KEY = 'helpbubble-pos'

// jsdom liefert 0/0 für getBoundingClientRect und misst env(safe-area)=0.
const rightEdge = () => window.innerWidth - FAB - MARGIN
const maxTop = () => window.innerHeight - FAB - BOTTOM_RESERVE

// Der FAB ist das einzige Button-Element mit aria-expanded (der Panel-Schliessen-
// Button hat keins) → stabil auffindbar, auch wenn das Panel offen ist.
const getFab = () => screen.getByRole('button', { expanded: false })

beforeEach(() => {
  localStorage.clear()
})

describe('HelpBubble — Tippen öffnet', () => {
  it('öffnet das Panel bei einem Tap (pointerdown/up ohne Bewegung → click)', () => {
    render(<HelpBubble />)
    const fab = getFab()
    fireEvent.pointerDown(fab, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(fab, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.click(fab)
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('behandelt eine Mini-Bewegung unter der Schwelle noch als Tap (öffnet, nichts gemerkt)', () => {
    render(<HelpBubble />)
    const fab = getFab()
    fireEvent.pointerDown(fab, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(fab, { clientX: 3, clientY: 2, pointerId: 1 })  // < DRAG_THRESHOLD (6)
    fireEvent.pointerUp(fab, { clientX: 3, clientY: 2, pointerId: 1 })
    fireEvent.click(fab)
    expect(screen.queryByRole('dialog')).not.toBeNull()
    expect(localStorage.getItem(POS_KEY)).toBeNull()
  })
})

describe('HelpBubble — nur an den Rand (Kanten-Einrasten)', () => {
  it('rastet nach links ein, wenn links losgelassen (nicht mitten im Inhalt)', () => {
    render(<HelpBubble />)
    const fab = getFab()
    fireEvent.pointerDown(fab, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(fab, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(fab, { clientX: 100, clientY: 100, pointerId: 1 })

    // Linke Kante (nicht x=100).
    expect(fab.style.left).toBe(`${MARGIN}px`)
    expect(fab.style.top).toBe('100px')
    expect(JSON.parse(localStorage.getItem(POS_KEY) as string)).toEqual({ left: MARGIN, top: 100 })

    // Klick direkt nach dem Ziehen öffnet NICHT.
    fireEvent.click(fab)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rastet nach rechts ein, wenn rechts losgelassen', () => {
    render(<HelpBubble />)
    const fab = getFab()
    fireEvent.pointerDown(fab, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(fab, { clientX: window.innerWidth, clientY: 120, pointerId: 1 })
    fireEvent.pointerUp(fab, { clientX: window.innerWidth, clientY: 120, pointerId: 1 })

    expect(fab.style.left).toBe(`${rightEdge()}px`)
    expect(fab.style.top).toBe('120px')
  })
})

describe('HelpBubble — überdeckt die unteren Menüpunkte nicht', () => {
  it('klemmt beim Ziehen ganz nach unten über der Nav-Leiste (top = maxTop)', () => {
    render(<HelpBubble />)
    const fab = getFab()
    fireEvent.pointerDown(fab, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(fab, { clientX: 9999, clientY: 9999, pointerId: 1 })
    fireEvent.pointerUp(fab, { clientX: 9999, clientY: 9999, pointerId: 1 })

    // Rechte Kante + vertikal geklemmt: der FAB endet ÜBER der Nav-Leiste.
    expect(fab.style.left).toBe(`${rightEdge()}px`)
    expect(fab.style.top).toBe(`${maxTop()}px`)
    // Unterkante des FAB liegt oberhalb des reservierten Nav-Bereichs.
    expect(maxTop() + FAB).toBeLessThanOrEqual(window.innerHeight - BOTTOM_RESERVE)
  })
})

describe('HelpBubble — gemerkte Position beim Start', () => {
  it('rastet eine gespeicherte Position beim Start an die Kante ein', () => {
    localStorage.setItem(POS_KEY, JSON.stringify({ left: 5, top: 100 }))
    render(<HelpBubble />)
    const fab = getFab()
    expect(fab.style.left).toBe(`${MARGIN}px`)  // 5 → linke Kante 12
    expect(fab.style.top).toBe('100px')
  })

  it('fällt bei korruptem Wert auf die Default-Ecke zurück (kein left/top)', () => {
    localStorage.setItem(POS_KEY, '{kaputt')
    render(<HelpBubble />)
    const fab = getFab()
    expect(fab.style.left).toBe('')
    expect(fab.style.right).not.toBe('')
  })
})


// ── Hilfe/Support-Matrix (Spec docs/specs/support-ticket.md §6.1) ──────────
//
// Die Blase trägt jetzt zwei unabhängig schaltbare Teile. Was hier geprüft wird,
// ist die Kombinationslogik: welcher Inhalt erscheint bei welcher Schalterstellung.

describe('HelpBubble — Hilfe und Support unabhängig schaltbar', () => {
  const openPanel = () => {
    const fab = getFab()
    fireEvent.pointerDown(fab, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(fab, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.click(fab)
  }

  it('zeigt nur den Chat, wenn Support aus ist', () => {
    render(<HelpBubble showHelp showSupport={false} />)
    openPanel()
    expect(screen.queryByTestId('helpbot')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Problem melden/ })).toBeNull()
  })

  it('ist direkt das Meldeformular, wenn nur Support an ist', () => {
    // Ein Reiter, den man nicht wechseln kann, wäre nur Dekoration.
    render(<HelpBubble showHelp={false} showSupport />)
    openPanel()
    expect(screen.queryByTestId('helpbot')).toBeNull()
    expect(screen.queryByLabelText('Was ist passiert?')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Fragen$/ })).toBeNull()
  })

  it('zeigt Reiter, wenn beide an sind — Chat zuerst', () => {
    render(<HelpBubble showHelp showSupport />)
    openPanel()
    expect(screen.queryByTestId('helpbot')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Problem melden/ }))
    expect(screen.queryByLabelText('Was ist passiert?')).not.toBeNull()
  })

  it('nennt im Titel, was aktiv ist', () => {
    render(<HelpBubble showHelp={false} showSupport />)
    openPanel()
    expect(screen.getByText('Support')).toBeTruthy()
  })
})

