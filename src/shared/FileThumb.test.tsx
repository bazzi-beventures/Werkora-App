import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FileThumb, PREVIEW_DELAY_MS } from './FileThumb'

// Miniatur + Vorschau beim Überfahren für Projektfotos
// (docs/specs/kleinkorrekturen-2026-10.md §1).

afterEach(() => { vi.useRealTimers() })

function bild(container: HTMLElement) {
  return container.querySelector('img')
}

describe('FileThumb', () => {
  it('zeigt bei Fotos eine Miniatur, die erst bei Bedarf lädt', () => {
    const { container } = render(<FileThumb url="/f/1" mimeType="image/jpeg" filename="a.jpg" />)
    const img = bild(container)!
    expect(img).toHaveAttribute('src', '/f/1')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('bleibt bei anderen Dateien beim Symbol', () => {
    const { container } = render(<FileThumb url="/f/1" mimeType="application/pdf" filename="a.pdf" />)
    expect(bild(container)).toBeNull()
  })

  it('zeigt ohne Adresse (offline, kein Storage) das Symbol', () => {
    const { container } = render(<FileThumb url={null} mimeType="image/jpeg" filename="a.jpg" />)
    expect(bild(container)).toBeNull()
  })

  it('fällt auf das Symbol zurück, wenn der Browser das Bild nicht anzeigen kann', () => {
    const { container } = render(<FileThumb url="/f/1" mimeType="image/heic" filename="a.heic" />)
    fireEvent.error(bild(container)!)
    expect(bild(container)).toBeNull()
  })

  it('öffnet die Vorschau mit der Maus erst nach der Verzögerung und schliesst sie beim Verlassen', () => {
    vi.useFakeTimers()
    const { container } = render(<FileThumb url="/f/1" mimeType="image/png" filename="a.png" hoverPreview />)
    const anker = bild(container)!.parentElement!
    fireEvent.pointerEnter(anker, { pointerType: 'mouse' })
    expect(screen.queryByRole('img', { name: 'Vorschau a.png' })).toBeNull()
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(screen.getByRole('img', { name: 'Vorschau a.png' })).toBeInTheDocument()
    fireEvent.pointerLeave(anker)
    expect(screen.queryByRole('img', { name: 'Vorschau a.png' })).toBeNull()
  })

  it('blitzt beim schnellen Überfahren nicht auf', () => {
    vi.useFakeTimers()
    const { container } = render(<FileThumb url="/f/1" mimeType="image/png" filename="a.png" hoverPreview />)
    const anker = bild(container)!.parentElement!
    fireEvent.pointerEnter(anker, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS - 50) })
    fireEvent.pointerLeave(anker)
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(screen.queryByRole('img', { name: 'Vorschau a.png' })).toBeNull()
  })

  it('zeigt bei Touch keine Vorschau', () => {
    vi.useFakeTimers()
    const { container } = render(<FileThumb url="/f/1" mimeType="image/png" filename="a.png" hoverPreview />)
    fireEvent.pointerEnter(bild(container)!.parentElement!, { pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS * 2) })
    expect(screen.queryByRole('img', { name: 'Vorschau a.png' })).toBeNull()
  })

  it('zeigt ohne hoverPreview (Mitarbeiter-App) keine Vorschau', () => {
    vi.useFakeTimers()
    const { container } = render(<FileThumb url="/f/1" mimeType="image/png" filename="a.png" />)
    fireEvent.pointerEnter(bild(container)!.parentElement!, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS * 2) })
    expect(screen.queryByRole('img', { name: 'Vorschau a.png' })).toBeNull()
  })
})
