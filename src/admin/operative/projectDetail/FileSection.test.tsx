/**
 * Einordnung der Auftragsbestätigung an den Kunden (Kategorie
 * `auftragsbestaetigung_kunde`). Das PDF legt der Versand-Knopf serverseitig ab
 * (services/quote_order_confirmation_pdf.py) — die App muss es an genau EINER Stelle
 * zeigen: im Offerten-Tab, als Fortsetzung der Offerte.
 *
 * Der teure Fehler wäre die Verwechslung mit `auftragsbestaetigung` (ohne Suffix):
 * das ist die AB des LIEFERANTEN, ein Lieferantendokument. Und die zweite Falle ist
 * der Legacy-Fallback von «Sonstiges», der jede unbekannte Kategorie einsammelt — eine
 * neue Kategorie, die dort nicht registriert ist, erschiene doppelt.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { FileSections, PROJECT_DOC_SECTIONS, QUOTE_DOC_SECTIONS, SUPPLIER_DOC_SECTIONS } from './FileSection'
import type { ProjectFile, ProjectFileCategory } from './types'

function makeFile(category: ProjectFileCategory | null, filename: string): ProjectFile {
  return {
    id: `f-${filename}`,
    filename,
    storage_path: `documents/${filename}`,
    mime_type: 'application/pdf',
    category,
    created_at: '2026-08-19T10:00:00Z',
  }
}

const AB_KUNDE = makeFile('auftragsbestaetigung_kunde', 'Auftragsbestaetigung_OF-2026-042.pdf')

function renderSections(sections: typeof PROJECT_DOC_SECTIONS, files: ProjectFile[]) {
  render(
    <FileSections
      files={files}
      sections={sections}
      uploading={false}
      uploadingCategory={null}
      onUpload={vi.fn()}
      onDelete={vi.fn()}
      onRename={vi.fn()}
    />,
  )
}

describe('Auftragsbestätigung an den Kunden', () => {
  it('steht im Offerten-Tab, nicht bei den Lieferantendokumenten', () => {
    expect(QUOTE_DOC_SECTIONS.map(s => s.key)).toContain('auftragsbestaetigung_kunde')
    expect(SUPPLIER_DOC_SECTIONS.map(s => s.key)).not.toContain('auftragsbestaetigung_kunde')
    // Die Lieferanten-Sektion bleibt, was sie war: die AB des Lieferanten an uns.
    expect(SUPPLIER_DOC_SECTIONS.map(s => s.key)).toContain('auftragsbestaetigung')
  })

  it('erscheint im Offerten-Tab unter der eigenen Sektion', () => {
    renderSections(QUOTE_DOC_SECTIONS, [AB_KUNDE, makeFile('offerte', 'Alt-Offerte.pdf')])
    // Titelzeile -> Sektions-Container (die Überschrift steht in einem span im Kopf).
    const section = screen.getByText('Auftragsbestätigungen an den Kunden')
      .closest('div')!.parentElement!
    expect(within(section).getByText('Auftragsbestaetigung_OF-2026-042.pdf')).toBeTruthy()
    // Die hochgeladene Fremd-Offerte bleibt in ihrer eigenen Sektion.
    expect(within(section).queryByText('Alt-Offerte.pdf')).toBeNull()
  })

  it('landet nicht zusätzlich unter «Sonstiges»', () => {
    renderSections(PROJECT_DOC_SECTIONS, [AB_KUNDE, makeFile(null, 'Altlast.pdf')])
    expect(screen.queryByText('Auftragsbestaetigung_OF-2026-042.pdf')).toBeNull()
    // Gegenprobe: echte Altlasten (Kategorie null) fängt «Sonstiges» weiterhin auf.
    expect(screen.getByText('Altlast.pdf')).toBeTruthy()
  })
})

// docs/specs/kleinkorrekturen-2026-10.md §1/§2: Fotos mit Miniatur, beim
// Umbenennen ist der Name ohne Endung markiert.
describe('Fotos: Miniatur und Umbenennen', () => {
  const FOTO: ProjectFile = { ...makeFile('fotos', 'Baustelle Nord.jpg'), mime_type: 'image/jpeg' }

  it('zeigt vor einem Foto die Miniatur aus dem Proxy', () => {
    renderSections(PROJECT_DOC_SECTIONS, [FOTO, makeFile('fotos', 'Plan.pdf')])
    const imgs = document.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', `/pwa/admin/project-files/${FOTO.id}/download`)
  })

  it('markiert beim Umbenennen den Namen ohne Endung', () => {
    renderSections(PROJECT_DOC_SECTIONS, [FOTO])
    fireEvent.click(screen.getByTitle('Umbenennen'))
    const input = screen.getByRole('textbox', { name: 'Neuer Dateiname' }) as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Baustelle Nord'.length])
  })
})
