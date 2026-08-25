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
    pdf_url: null,
    xlsx_url: null,
    customer_email: 'kunde@example.ch',
    ...over,
  }
}

function renderTab(quotes: ProjectQuote[], onUpdateStatus = vi.fn()) {
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
    { id: 'f1', filename: 'Alt-Offerte_2019.pdf', file_url: null, mime_type: 'application/pdf', category: 'offerte' as const, created_at: '2026-07-01T09:00:00Z' },
    { id: 'f2', filename: 'Prospekt.pdf', file_url: null, mime_type: 'application/pdf', category: 'anhang' as const, created_at: '2026-07-01T09:00:00Z' },
  ]

  function renderWithFiles(props: Record<string, unknown> = {}) {
    render(
      <QuotesTab
        quotes={[makeQuote()]} invoices={[]} regeneratingQuoteId={null} hasLocalDraft={false}
        dankEnabled={false}
        absageEnabled={false} sendingRejectionId={null}
        onShowCreateForm={() => {}} onResumeDraft={() => {}} onUpdateStatus={() => {}}
        onRegenerate={() => {}} onSend={() => {}} onSendThankyou={() => {}} onSendOrderConfirmation={() => {}}
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
