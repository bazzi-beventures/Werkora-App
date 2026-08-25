import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProjektDrillModal from './ProjektDrillModal'
import type { PipelineProjektAgg } from '../pipelineAggregation'

function agg(over: Partial<PipelineProjektAgg> = {}): PipelineProjektAgg {
  return {
    projektNummer: '2600100',
    projektName: 'Storenmontage Müller',
    projektStatus: 'offen',
    isClosed: false,
    kunde: 'Müller GmbH',
    projektleiter: 'Hans Muster',
    offertenOffen: 1,
    offertenOffenChf: 1200,
    offertenVersendet: 1,
    offertenAkzeptiert: 0,
    rapporte: 1,
    rechnungenVersendet: 1,
    rechnungenChf: 500,
    bezahltChf: 500,
    offertenDetail: [{ status: 'gesendet', betrag: 1200, datum: '2026-05-10' }],
    rapporteDetail: ['2026-05-15'],
    rechnungenDetail: [{ status: 'bezahlt', betrag: 500, gesendet_am: '2026-05-20', bezahlt_am: '2026-06-01', bezahlt_betrag: 500 }],
    offertenGesamt: 2, // eine Offerte liegt ausserhalb des Zeitraums
    rapporteGesamt: 1,
    rechnungenGesamt: 1,
    ...over,
  }
}

describe('ProjektDrillModal', () => {
  it('zeigt Kopf, Ereignis-Detail und den "+N ausserhalb"-Hinweis', () => {
    render(<ProjektDrillModal projekt={agg()} from="2026-05-01" to="2026-05-31" onClose={() => {}} />)

    expect(screen.getByText(/2600100 · Storenmontage Müller/)).toBeInTheDocument()
    expect(screen.getByText(/Müller GmbH · Hans Muster/)).toBeInTheDocument()
    expect(screen.getByText(/Zeitraum 2026-05-01 – 2026-05-31/)).toBeInTheDocument()

    // Section-Überschriften mit den Detail-Zählern
    expect(screen.getByText('Offerten (1)')).toBeInTheDocument()
    expect(screen.getByText('Rapporte (1)')).toBeInTheDocument()
    expect(screen.getByText('Rechnungen (1)')).toBeInTheDocument()

    // Offerten-Betrag und Rapport-Datum
    expect(screen.getByText("CHF 1'200")).toBeInTheDocument()
    expect(screen.getByText('2026-05-15')).toBeInTheDocument()

    // Rechnung bezahlt
    expect(screen.getByText(/Versendet 2026-05-20 · Bezahlt 2026-06-01/)).toBeInTheDocument()

    // Hinweis auf die Offerte ausserhalb des Zeitraums
    expect(screen.getByText('+1 ausserhalb des Zeitraums')).toBeInTheDocument()
  })

  it('meldet "Alle Datensätze" ohne Datumsfilter und "Keine im Zeitraum" bei leeren Sektionen', () => {
    render(
      <ProjektDrillModal
        projekt={agg({ offertenDetail: [], rapporteDetail: [], rechnungenDetail: [], offertenGesamt: 0, rapporteGesamt: 0, rechnungenGesamt: 0 })}
        from={null}
        to={null}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Alle Datensätze/)).toBeInTheDocument()
    expect(screen.getAllByText('Keine im Zeitraum.')).toHaveLength(3)
  })

  it('weist eine Variantengruppe als solche aus, eine Einzelofferte nicht', () => {
    // Der Betrag ist der der Leitvariante — ohne den Hinweis liest sich die Zeile
    // wie eine einzelne Offerte ueber CHF 1'200.
    const { rerender } = render(
      <ProjektDrillModal
        projekt={agg({ offertenDetail: [{ status: 'gesendet', betrag: 1200, datum: '2026-05-10', variant_count: 3 }] })}
        from={null} to={null} onClose={() => {}}
      />,
    )
    expect(screen.getByText('· 1 von 3 Varianten')).toBeInTheDocument()

    // variant_count 1 bzw. fehlend (aelteres Backend) => kein Hinweis.
    rerender(
      <ProjektDrillModal
        projekt={agg({ offertenDetail: [{ status: 'gesendet', betrag: 1200, datum: '2026-05-10' }] })}
        from={null} to={null} onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/von .* Varianten/)).not.toBeInTheDocument()
  })

  it('schliesst per Button, Escape und Overlay-Klick', () => {
    const onClose = vi.fn()
    const { container, rerender } = render(
      <ProjektDrillModal projekt={agg()} from={null} to={null} onClose={onClose} />,
    )

    fireEvent.click(screen.getByLabelText('Schliessen'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)

    // Klick auf das Overlay (nicht auf den Panel-Inhalt) schliesst ebenfalls —
    // aber nur, wenn mousedown UND click dort landen (backdropCloseProps-Guard):
    // eine im Inhalt begonnene Textauswahl, die auf dem Overlay endet, darf das
    // Fenster NICHT schliessen.
    rerender(<ProjektDrillModal projekt={agg()} from={null} to={null} onClose={onClose} />)
    const overlay = container.querySelector('.admin-modal-overlay')!
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(3)

    // Textauswahl-Drag: mousedown im Inhalt, click landet auf dem Overlay → offen.
    fireEvent.mouseDown(container.querySelector('.admin-modal')!)
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
