import { describe, it, expect } from 'vitest'
import { fileExtension, supplierDocFilename } from './supplierDocName'

// Das per OCR eingelesene Lieferanten-PDF liegt nach dem Speichern im Projekt.
// Bisher unter dem Namen des Lieferanten («Angebot_2600772.pdf») — in der
// Dokumentenliste eine Zeile, der man nicht ansieht, wozu sie gehört. Jetzt unter
// Projektnummer + Projektname.

const P = { project_id_text: 'P26-0424', name: 'Bollmann Seuzach' }

describe('supplierDocFilename', () => {
  it('benennt nach Projektnummer und Projektname', () => {
    expect(supplierDocFilename('Angebot_2600772.pdf', P)).toBe('P26-0424 Bollmann Seuzach.pdf')
  })

  it('behaelt die Endung der Originaldatei', () => {
    expect(supplierDocFilename('ausmass.XLSX', P)).toBe('P26-0424 Bollmann Seuzach.xlsx')
    // Ohne erkennbare Endung ist es ein PDF — der OCR-Pfad nimmt nichts anderes an.
    expect(supplierDocFilename('Angebot 12.03.2026', P)).toBe('P26-0424 Bollmann Seuzach.pdf')
  })

  it('kommt mit fehlender Nummer oder fehlendem Namen aus', () => {
    // Projektentwürfe haben noch keine Nummer — ein halber Name ist immer noch
    // besser als der Dateiname des Lieferanten.
    expect(supplierDocFilename('x.pdf', { name: 'Bollmann Seuzach' })).toBe('Bollmann Seuzach.pdf')
    expect(supplierDocFilename('x.pdf', { project_id_text: 'P26-0424' })).toBe('P26-0424.pdf')
  })

  it('laesst den Originalnamen stehen, wenn das Projekt nichts hergibt', () => {
    expect(supplierDocFilename('Angebot_2600772.pdf', null)).toBe('Angebot_2600772.pdf')
    expect(supplierDocFilename('Angebot_2600772.pdf', { name: '   ' })).toBe('Angebot_2600772.pdf')
  })

  it('nummeriert mehrere Quell-PDFs derselben Offerte durch', () => {
    expect(supplierDocFilename('a.pdf', P, 0)).toBe('P26-0424 Bollmann Seuzach.pdf')
    expect(supplierDocFilename('b.pdf', P, 1)).toBe('P26-0424 Bollmann Seuzach (2).pdf')
  })

  it('entfernt Pfad-Trenner, behaelt aber Bindestrich und Punkt der Nummer', () => {
    const name = supplierDocFilename('x.pdf', { project_id_text: 'P26-0424', name: 'Meier/Müller AG' })
    expect(name).toBe('P26-0424 Meier Müller AG.pdf')
  })

  it('deckelt sehr lange Projektnamen', () => {
    const long = supplierDocFilename('x.pdf', { project_id_text: 'P26-0424', name: 'A'.repeat(300) })
    expect(long.length).toBeLessThanOrEqual(105)
    expect(long.endsWith('.pdf')).toBe(true)
  })
})

describe('fileExtension', () => {
  it('erkennt kurze Endungen und faellt sonst auf .pdf zurueck', () => {
    expect(fileExtension('a.PDF')).toBe('.pdf')
    expect(fileExtension('a.jpeg')).toBe('.jpeg')
    expect(fileExtension('ohne-endung')).toBe('.pdf')
  })
})
