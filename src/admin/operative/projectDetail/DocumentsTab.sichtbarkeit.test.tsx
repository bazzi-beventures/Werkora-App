import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentsTab, SupplierDocumentsTab } from './DocumentsTab'
import { MONTEUR_HIDDEN_FILE_CATEGORIES } from '../../../shared/projectDetail/types'

// WW-73: «Lieferscheine auch für Monteure ersichtlich machen» — sie waren es
// schon (Karte «Lieferscheine» in der PWA), nur sagte die Verwaltung es nicht,
// und das Büro legte jeden Lieferschein ein zweites Mal unter Dokumente ab.

const props = {
  files: [], uploading: false, uploadingCategory: null,
  onUpload: vi.fn(), onDelete: vi.fn(), onRename: vi.fn().mockResolvedValue(undefined),
}

function badgeOf(sectionTitle: string): string | null {
  const header = screen.getByText(sectionTitle, { selector: 'span' }).parentElement!
  return header.querySelector('[data-testid="file-section-visibility"]')?.textContent ?? null
}

describe('Lieferantendokumente — wer sieht was (WW-73)', () => {
  it('markiert den Lieferschein als für Monteure sichtbar, den Einkauf als «Nur Büro»', () => {
    render(<SupplierDocumentsTab {...props} />)
    expect(badgeOf('Lieferschein')).toBe('Sehen auch die Monteure')
    expect(badgeOf('Angebote Lieferant')).toBe('Nur Büro')
    expect(badgeOf('Bestellungen')).toBe('Nur Büro')
    expect(badgeOf('Auftragsbestätigung')).toBe('Nur Büro')
    // Und sagt, dass das zweite Ablegen unter «Dokumente» nicht nötig ist.
    expect(screen.getByText(/ein zweites Ablegen unter «Dokumente» ist nicht nötig/)).toBeTruthy()
  })

  it('der Reiter Dokumente sagt einmal oben, dass die Monteure alles darin sehen', () => {
    render(<DocumentsTab {...props} />)
    expect(screen.getByText(/Alles in diesem Reiter sehen die Monteure/)).toBeTruthy()
    // Keine Marke je Abschnitt: dort ist ohnehin alles sichtbar.
    expect(screen.queryByTestId('file-section-visibility')).toBeNull()
  })

  it('verbirgt genau die vier Einkaufs-Kategorien (Spiegel von ADMIN_ONLY_FILE_CATEGORIES)', () => {
    expect([...MONTEUR_HIDDEN_FILE_CATEGORIES].sort()).toEqual([
      'angebot_lieferant', 'auftragsbestaetigung', 'bestellungen', 'rechnung_lieferant',
    ])
  })

  // Modul `kreditoren`: die visierte Lieferantenrechnung legt das Visum ab, nicht
  // das Büro. Kein Upload, kein Löschen — und ohne Datei gar kein Abschnitt.
  it('«Rechnungen Lieferant» erscheint erst mit einer Datei, nur fürs Büro und ohne Upload', () => {
    const { unmount } = render(<SupplierDocumentsTab {...props} />)
    expect(screen.queryByText('Rechnungen Lieferant', { selector: 'span' })).toBeNull()
    unmount()

    const rechnung = {
      id: 'r1', filename: 'Griesser_R-100.pdf', storage_path: 'documents/r.pdf',
      mime_type: 'application/pdf', category: 'rechnung_lieferant' as const, created_at: '2026-11-10T10:00:00Z',
    }
    render(<SupplierDocumentsTab {...props} files={[rechnung]} />)
    expect(badgeOf('Rechnungen Lieferant')).toBe('Nur Büro')
    const abschnitt = screen.getByText('Rechnungen Lieferant', { selector: 'span' }).parentElement!.parentElement!
    expect(abschnitt.textContent).toContain('Griesser_R-100.pdf')
    expect(abschnitt.querySelector('input[type="file"]')).toBeNull()
    expect(abschnitt.querySelector('button[title="Umbenennen"]')).toBeNull()
    expect(abschnitt.textContent).not.toContain('Hochladen')
  })
})
