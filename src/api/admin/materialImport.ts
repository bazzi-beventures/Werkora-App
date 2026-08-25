// Material-Import aus Lieferanten-Listen (Excel/CSV): Datei analysieren, Vorschau,
// Import.
// Teil des api/admin/-Barrels (Charge H1): eine Datei je Domäne, gebündelt in
// index.ts — bestehende `from '../api/admin'`-Importe bleiben damit gültig.
//
// Der Ablauf ist dreistufig und immer derselbe Endpoint für Schritt 2 und 3 —
// `preview` entscheidet, ob geschrieben wird:
//   1. `parseImportFile`  — Spalten lesen, Feld-Zuordnung vorschlagen
//   2. `previewImport`    — trockener Lauf: was würde neu/geändert/unverändert
//   3. `commitImport`     — dasselbe, aber es wird geschrieben

import { apiFormFetch } from '../client'

// Ein Zielfeld der Zuordnung (Artikelnummer, Bezeichnung, EK …).
export interface ImportFieldDef {
  key: string
  label: string
  required: boolean
}

export interface ImportParseResult {
  columns: string[]
  fields: ImportFieldDef[]
  // Vorgeschlagene Zuordnung Zielfeld → Spaltenname (null = nicht erkannt).
  mapping: Record<string, string | null>
  // Das Feld, über das im Modus «Lieferant pro Zeile» der Lieferant kommt.
  supplier_field: { key: string; label: string }
  supplier_guess: string | null
  // Eigene Artikel (Feature import_eigenartikel) haben ein eigenes Feld-Set:
  // ohne Lieferanten-Artikelnummer.
  own_fields: ImportFieldDef[]
  own_mapping: Record<string, string | null>
  sample_rows: Record<string, string | number | null>[]
  row_count: number
}

export type ImportRowAction = 'new' | 'update' | 'unchanged'

export interface ImportPreviewRow {
  manufacturer_art_nr: string | null
  art_nr: string
  name: string
  unit: string
  category: string | null
  cost_price: number | null
  // EK vor dem Import — zeigt die Teuerung in der Vorschau.
  old_cost_price: number | null
  unit_price: number
  supplier_name: string | null
  // true = dieser Lieferant würde beim Import neu angelegt.
  supplier_new: boolean
  action: ImportRowAction
}

export interface ImportPreviewResult {
  preview: true
  per_row: boolean
  own_articles?: boolean
  supplier_name: string | null
  new_suppliers: string[]
  rows: ImportPreviewRow[]
  errors: { row: number; message: string }[]
  summary: { new: number; update: number; unchanged: number; errors: number }
}

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
  new_suppliers: string[]
  errors: { row: number; message: string }[]
}

/** Liest nur Spalten und Beispielzeilen — schreibt nichts. */
export async function parseImportFile(file: File): Promise<ImportParseResult> {
  const fd = new FormData()
  fd.append('file', file)
  return apiFormFetch<ImportParseResult>('/pwa/admin/import/parse', fd)
}

export interface MaterialImportRequest {
  file: File
  /**
   * Zielfeld → Spaltenname. Im Modus «Lieferant pro Zeile» steht der Lieferant
   * NICHT in einem eigenen Feld, sondern als Zuordnung unter
   * `ImportParseResult.supplier_field.key` — der Aufrufer kennt den Key aus der
   * Analyse und trägt ihn hier ein.
   */
  mapping: Record<string, string>
  /** Eigene Artikel (Feature import_eigenartikel) — ohne Lieferantenbezug. */
  ownArticles?: boolean
  /** Ein Lieferant für die ganze Datei. Bei «pro Zeile» und «eigene Artikel» weglassen. */
  supplierId?: string
}

function buildFormData(req: MaterialImportRequest, preview: boolean): FormData {
  const fd = new FormData()
  fd.append('file', req.file)
  if (req.ownArticles) {
    fd.append('own_articles', 'true')
  } else if (req.supplierId !== undefined) {
    fd.append('supplier_id', req.supplierId)
  }
  fd.append('mapping', JSON.stringify(req.mapping))
  fd.append('preview', preview ? 'true' : 'false')
  return fd
}

/** Trockener Lauf: dieselbe Nutzlast wie `commitImport`, nur mit `preview=true`. */
export async function previewMaterialImport(req: MaterialImportRequest): Promise<ImportPreviewResult> {
  return apiFormFetch<ImportPreviewResult>('/pwa/admin/import/materials', buildFormData(req, true))
}

export async function commitMaterialImport(req: MaterialImportRequest): Promise<ImportResult> {
  return apiFormFetch<ImportResult>('/pwa/admin/import/materials', buildFormData(req, false))
}
