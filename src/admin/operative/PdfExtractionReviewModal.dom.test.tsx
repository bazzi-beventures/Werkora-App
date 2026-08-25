import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PdfExtractionReviewModal, PdfExtractionResponse } from './PdfExtractionReviewModal'

// Die geprüften Positionen leben nur in diesem Modal — sie stecken NICHT im
// localStorage-Entwurf der Offerte. Ein Klick neben das Fenster darf sie darum
// nicht kommentarlos wegwerfen.
function data(products: PdfExtractionResponse['products']): PdfExtractionResponse {
  return {
    supplier: 'stobag',
    supplier_label: 'Stobag',
    supplier_id: 'sup-1',
    project_ref: '2600100',
    products,
  }
}

const PRODUCT = {
  name: 'Rolpac III',
  description: 'Storen',
  quantity: 2,
  unit: 'Stk',
  ek_price: 513.18,
  suggested_category: 'storen',
  suggested_margin_factor: 1.75,
  suggested_vk_price: null,
}

function overlay(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement
}

describe('PdfExtractionReviewModal — Klick neben das Fenster', () => {
  it('fragt nach, statt die erfassten Positionen zu verwerfen', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <PdfExtractionReviewModal data={data([PRODUCT])} onCancel={onCancel} onConfirm={() => {}} />,
    )

    const bg = overlay(container)
    fireEvent.mouseDown(bg)
    fireEvent.click(bg)

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByText('Positionen verwerfen?')).toBeInTheDocument()

    // «Weiter bearbeiten» lässt das Fenster stehen …
    fireEvent.click(screen.getByText('Weiter bearbeiten'))
    expect(screen.queryByText('Positionen verwerfen?')).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()

    // … erst «Verwerfen» schliesst es.
    fireEvent.mouseDown(bg)
    fireEvent.click(bg)
    fireEvent.click(screen.getByText('Verwerfen'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('schliesst ohne Rückfrage, wenn es nichts zu übernehmen gibt', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <PdfExtractionReviewModal data={data([])} onCancel={onCancel} onConfirm={() => {}} mode="manual" />,
    )

    const bg = overlay(container)
    fireEvent.mouseDown(bg)
    fireEvent.click(bg)

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Positionen verwerfen?')).not.toBeInTheDocument()
  })

  it('Esc bei offener Rückfrage schliesst nur die Rückfrage, nicht das Fenster', () => {
    // Der Esc-Handler des Offert-Formulars hängt am window und würde sonst das
    // Review-Fenster samt Positionen schliessen.
    const onCancel = vi.fn()
    const formEsc = vi.fn()
    window.addEventListener('keydown', formEsc)
    try {
      const { container } = render(
        <PdfExtractionReviewModal data={data([PRODUCT])} onCancel={onCancel} onConfirm={() => {}} />,
      )
      const bg = overlay(container)
      fireEvent.mouseDown(bg)
      fireEvent.click(bg)
      expect(screen.getByText('Positionen verwerfen?')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByText('Positionen verwerfen?')).not.toBeInTheDocument()
      expect(onCancel).not.toHaveBeenCalled()
      expect(formEsc).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', formEsc)
    }
  })

  it('bleibt offen, wenn eine Textauswahl im Fenster auf dem Hintergrund endet', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <PdfExtractionReviewModal data={data([PRODUCT])} onCancel={onCancel} onConfirm={() => {}} />,
    )

    const bg = overlay(container)
    fireEvent.mouseDown(bg.firstElementChild as HTMLElement)
    fireEvent.click(bg)

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.queryByText('Positionen verwerfen?')).not.toBeInTheDocument()
  })
})
