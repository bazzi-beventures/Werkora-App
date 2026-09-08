import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuotesTab } from './tabs'
import type { ProjectQuote } from './tabs'

function makeQuote(over: Partial<ProjectQuote> = {}): ProjectQuote {
  return {
    id: 1,
    parent_id: 1,
    version: 1,
    quote_number: 'OFF-2026-014',
    total_amount: 12500,
    status: 'gesendet',
    created_at: '2026-07-20T10:00:00Z',
    customer_email: 'kunde@example.ch',
    ...over,
  }
}

function renderTab(
  quotes: ProjectQuote[],
  onUpdateStatus = vi.fn(),
  onMarkSentByPost: (id: number, date: string) => Promise<boolean> = async () => true,
) {
  render(
    <QuotesTab
      quotes={quotes}
      invoices={[]}
      regeneratingQuoteId={null}
      hasLocalDraft={false}
      dankEnabled={false}
      absageEnabled={false}
      sendingRejectionId={null}
      onShowCreateForm={() => {}}
      onResumeDraft={() => {}}
      onUpdateStatus={onUpdateStatus}
      onRegenerate={() => {}}
      onSend={() => {}}
      onSendThankyou={() => {}}
      onSendOrderConfirmation={() => {}}
      onMarkSentByPost={onMarkSentByPost}
      onSendRejection={() => {}}
      onEdit={() => {}}
    />
  )
  return onUpdateStatus
}

describe('QuotesTab — Status-Buttons', () => {
  // Regression: im Projekt-Detail fehlte ein "Abgelehnt"-Button komplett; ein
  // abgelehntes Angebot liess sich nur über die separate Offerten-Liste abschliessen.
  it.each(['entwurf', 'gesendet'])('zeigt Akzeptiert und Abgelehnt bei Status %s', (status) => {
    renderTab([makeQuote({ status })])
    expect(screen.getByRole('button', { name: 'Akzeptiert' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abgelehnt' })).toBeInTheDocument()
  })

  it('meldet den Klick auf Abgelehnt mit Status "abgelehnt"', async () => {
    const onUpdateStatus = renderTab([makeQuote({ id: 7, status: 'gesendet' })])
    await userEvent.click(screen.getByRole('button', { name: 'Abgelehnt' }))
    expect(onUpdateStatus).toHaveBeenCalledWith(7, 'abgelehnt')
  })

  it('meldet den Klick auf Akzeptiert mit Status "akzeptiert"', async () => {
    const onUpdateStatus = renderTab([makeQuote({ id: 7, status: 'gesendet' })])
    await userEvent.click(screen.getByRole('button', { name: 'Akzeptiert' }))
    expect(onUpdateStatus).toHaveBeenCalledWith(7, 'akzeptiert')
  })

  it.each(['akzeptiert', 'abgelehnt', 'archiviert'])(
    'blendet die Status-Buttons bei bereits entschiedenem Status %s aus',
    (status) => {
      renderTab([makeQuote({ status })])
      expect(screen.queryByRole('button', { name: 'Akzeptiert' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Abgelehnt' })).not.toBeInTheDocument()
    }
  )

  it('bietet die Status-Buttons nur auf der jüngsten Version an', () => {
    // Zwei Versionen derselben Kette: V2 ist aktuell, V1 nur noch Historie.
    renderTab([
      makeQuote({ id: 2, parent_id: 1, version: 2, quote_number: 'OFF-2026-015' }),
      makeQuote({ id: 1, parent_id: 1, version: 1 }),
    ])
    expect(screen.getAllByRole('button', { name: 'Abgelehnt' })).toHaveLength(1)
  })
})

describe('QuotesTab — Varianten', () => {
  // Varianten sind Standard-Fähigkeit (kein Feature-Flag): der Button erscheint immer,
  // sobald onAddVariant übergeben ist.
  function renderVariants(quotes: ProjectQuote[], onAddVariant = vi.fn()) {
    render(
      <QuotesTab
        quotes={quotes} invoices={[]} regeneratingQuoteId={null} hasLocalDraft={false}
        dankEnabled={false}
        absageEnabled={false} sendingRejectionId={null}
        onShowCreateForm={() => {}} onResumeDraft={() => {}} onUpdateStatus={() => {}}
        onRegenerate={() => {}} onSend={() => {}} onSendThankyou={() => {}} onSendOrderConfirmation={() => {}}
        onMarkSentByPost={async () => true}
      onSendRejection={() => {}} onEdit={() => {}}
        addingVariantId={null} onAddVariant={onAddVariant}
      />
    )
  }

  it('zeigt beide Buttons immer (kein Feature-Flag)', () => {
    renderVariants([makeQuote({ status: 'entwurf' })])
    expect(screen.getByRole('button', { name: '+ Variante' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Weitere Offerte' })).toBeInTheDocument()
  })

  it('„+ Variante" meldet die Art variante', async () => {
    const onAddVariant = vi.fn()
    renderVariants([makeQuote({ id: 7, status: 'entwurf' })], onAddVariant)
    await userEvent.click(screen.getByRole('button', { name: '+ Variante' }))
    expect(onAddVariant).toHaveBeenCalledWith(7, 'variante')
  })

  it('„+ Weitere Offerte" meldet die Art mehrfach', async () => {
    const onAddVariant = vi.fn()
    renderVariants([makeQuote({ id: 7, status: 'entwurf' })], onAddVariant)
    await userEvent.click(screen.getByRole('button', { name: '+ Weitere Offerte' }))
    expect(onAddVariant).toHaveBeenCalledWith(7, 'mehrfach')
  })

  it('zeigt Varianten-Labels (Option A/B) bei einer variante-Gruppe mit >1 Mitglied', () => {
    renderVariants([
      makeQuote({ id: 1, parent_id: 1, variant_group_id: 'G', variant_group_kind: 'variante', variant_rank: 1, quote_number: 'OFF-1' }),
      makeQuote({ id: 2, parent_id: 2, variant_group_id: 'G', variant_group_kind: 'variante', variant_rank: 2, quote_number: 'OFF-2' }),
    ])
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('zeigt Offerte-1/2-Labels bei einer mehrfach-Gruppe mit >1 Mitglied', () => {
    renderVariants([
      makeQuote({ id: 1, parent_id: 1, variant_group_id: 'G', variant_group_kind: 'mehrfach', variant_rank: 1, quote_number: 'OFF-1' }),
      makeQuote({ id: 2, parent_id: 2, variant_group_id: 'G', variant_group_kind: 'mehrfach', variant_rank: 2, quote_number: 'OFF-2' }),
    ])
    expect(screen.getByText('Offerte 1')).toBeInTheDocument()
    expect(screen.getByText('Offerte 2')).toBeInTheDocument()
  })

  it('zeigt Slot-Untervarianten als "Offerte 3 · Option A/B"', () => {
    // Der Gehlhaar-Testfall: 3 Offerten, von Offerte 3 eine Variante — die Kopie
    // teilt den Rang (Slot) und wird als Option B des Slots beschriftet.
    renderVariants([
      makeQuote({ id: 1, parent_id: 1, variant_group_id: 'G', variant_group_kind: 'mehrfach', variant_rank: 1, quote_number: 'OFF-1' }),
      makeQuote({ id: 2, parent_id: 2, variant_group_id: 'G', variant_group_kind: 'mehrfach', variant_rank: 2, quote_number: 'OFF-2' }),
      makeQuote({ id: 3, parent_id: 3, variant_group_id: 'G', variant_group_kind: 'mehrfach', variant_rank: 3, quote_number: 'OFF-3' }),
      makeQuote({ id: 9, parent_id: 9, variant_group_id: 'G', variant_group_kind: 'mehrfach', variant_rank: 3, quote_number: 'OFF-9' }),
    ])
    expect(screen.getByText('Offerte 1')).toBeInTheDocument()
    expect(screen.getByText('Offerte 2')).toBeInTheDocument()
    expect(screen.getByText('Offerte 3 · Option A')).toBeInTheDocument()
    expect(screen.getByText('Offerte 3 · Option B')).toBeInTheDocument()
  })
})

// Eingescannte Papier-Offerten und Offerten aus Fremdsystemen liegen als
// Projektdatei der Kategorie 'offerte' im Offerten-Reiter — analog zu den
// hochgeladenen Rapporten im Rapporte-Reiter.
describe('QuotesTab — hochgeladene Offerten', () => {
  const FILES = [
    { id: 'f1', filename: 'Alt-Offerte_2019.pdf', mime_type: 'application/pdf', category: 'offerte' as const, created_at: '2026-07-01T09:00:00Z' },
    { id: 'f2', filename: 'Prospekt.pdf', mime_type: 'application/pdf', category: 'anhang' as const, created_at: '2026-07-01T09:00:00Z' },
  ]

  function renderWithFiles(props: Record<string, unknown> = {}) {
    render(
      <QuotesTab
        quotes={[makeQuote()]} invoices={[]} regeneratingQuoteId={null} hasLocalDraft={false}
        dankEnabled={false}
        absageEnabled={false} sendingRejectionId={null}
        onShowCreateForm={() => {}} onResumeDraft={() => {}} onUpdateStatus={() => {}}
        onRegenerate={() => {}} onSend={() => {}} onSendThankyou={() => {}} onSendOrderConfirmation={() => {}}
        onMarkSentByPost={async () => true}
      onSendRejection={() => {}} onEdit={() => {}}
        {...props}
      />
    )
  }

  it('zeigt die Datei-Sektion, sobald die Upload-Handler gesetzt sind', () => {
    renderWithFiles({
      files: FILES, uploading: false, uploadingCategory: null,
      onUploadFile: vi.fn(), onDeleteFile: vi.fn(), onRenameFile: vi.fn(),
    })
    expect(screen.getByText(/Hochgeladene Offerten/)).toBeInTheDocument()
    expect(screen.getByText('Alt-Offerte_2019.pdf')).toBeInTheDocument()
  })

  it('zeigt dort nur Dateien der Kategorie offerte', () => {
    renderWithFiles({
      files: FILES, uploading: false, uploadingCategory: null,
      onUploadFile: vi.fn(), onDeleteFile: vi.fn(), onRenameFile: vi.fn(),
    })
    // 'anhang' gehoert in den Dokumente-Reiter (geht mit der Offerten-Mail raus)
    // und darf hier nicht mitgezaehlt werden.
    expect(screen.queryByText('Prospekt.pdf')).not.toBeInTheDocument()
  })

  it('bleibt ohne Upload-Handler unsichtbar (Abwärtskompatibilität)', () => {
    renderWithFiles()
    expect(screen.queryByText(/Hochgeladene Offerten/)).not.toBeInTheDocument()
  })
})

describe('QuotesTab — Per Post versendet', () => {
  // Spiegelt den Knopf der Rechnung: ein ausgedruckt übergebenes Angebot blieb
  // 'entwurf' und fiel damit aus Erinnerung und «Kein Feedback».
  it('zeigt den Knopf am Entwurf mit Dokument', () => {
    renderTab([makeQuote({ status: 'entwurf', storage_path: 'p/OFF.pdf' })])
    expect(screen.getByRole('button', { name: 'Per Post versendet' })).toBeInTheDocument()
  })

  it('zeigt ihn nicht ohne Dokument und nicht nach dem Versand', () => {
    renderTab([makeQuote({ status: 'entwurf' })])
    expect(screen.queryByRole('button', { name: 'Per Post versendet' })).toBeNull()
    screen.getByRole('button', { name: 'Senden' })  // die Zeile ist da, nur der Knopf nicht
  })

  it('zeigt ihn nicht bei einer bereits gesendeten Offerte', () => {
    renderTab([makeQuote({ status: 'gesendet', storage_path: 'p/OFF.pdf' })])
    expect(screen.queryByRole('button', { name: 'Per Post versendet' })).toBeNull()
  })

  it('meldet die Bestätigung mit dem vorbelegten Versanddatum', async () => {
    const onMark = vi.fn().mockResolvedValue(true)
    renderTab([makeQuote({ id: 7, status: 'entwurf', storage_path: 'p/OFF.pdf' })],
              vi.fn(), onMark)

    await userEvent.click(screen.getByRole('button', { name: 'Per Post versendet' }))
    const date = screen.getByLabelText('Versanddatum') as HTMLInputElement
    expect(date.value).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Als versendet markieren' }))

    expect(onMark).toHaveBeenCalledWith(7, date.value)
  })

  it('lässt den Dialog offen, wenn das Backend ablehnt', async () => {
    // Sonst wäre die Meldung (409 «kein Dokument», 400 «Datum») weg, bevor sie
    // jemand liest.
    const onMark = vi.fn().mockResolvedValue(false)
    renderTab([makeQuote({ id: 7, status: 'entwurf', storage_path: 'p/OFF.pdf' })],
              vi.fn(), onMark)

    await userEvent.click(screen.getByRole('button', { name: 'Per Post versendet' }))
    await userEvent.click(screen.getByRole('button', { name: 'Als versendet markieren' }))

    expect(screen.getByLabelText('Versanddatum')).toBeInTheDocument()
  })
})
