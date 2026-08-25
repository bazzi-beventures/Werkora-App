// Typen der Offert-Formulare (Charge H2).
//
// Erstellen und Bearbeiten arbeiten mit unterschiedlichen Zeilenformen — das ist
// kein Zufall, sondern der Unterschied der beiden Endpoints:
//
//   * Erstellen schickt Material als `art_nr` + Menge; der Server löst Bezeichnung
//     und Preis aus dem Katalog auf.
//   * Bearbeiten schickt aufgelöste Zeilen (Bezeichnung/Einheit/Preis) — die
//     gespeicherte Offerte kennt keine Artikelnummern mehr.
//
// Alles andere (freie Positionen, Sonderaufwände, Montage, Sonderpositionen) ist
// in beiden Masken dieselbe Form und steht darum nur einmal hier.

import type { ConfirmedPosition } from '../PdfExtractionReviewModal'
import type { SpecialMode } from '../../../api/admin/quoteTemplates'

// Stammdaten (Funktionen, Material, Lieferanten, Vorlagen) und die Offerte selbst
// stehen im API-Layer — hier stehen nur die Formularzeilen. Wer sie braucht,
// importiert aus `api/admin/…`; die Wiederausfuhr hier haelt die Importzeile der
// Masken kurz.
export type { StaffRole } from '../../../api/admin/staff'
export type { Material } from '../../../api/admin/materials'
export type { Supplier } from '../../../api/admin/suppliers'
export type { InstallationTpl, SpecialTpl, SpecialMode } from '../../../api/admin/quoteTemplates'
export type { Quote, QuoteDetail } from '../../../api/admin/quotes'

/** Projektleiter-Filter der Offertenliste — Teilmenge von StaffMember. */
export interface ProjektleiterOption {
  id: string
  name: string
}

// ─── Zeilen im Erstell-Formular ─────────────────────────────

// `hidden` (Workflow "montage_in_produktpreis"): Stunden dem Kunden nicht als eigene
// Lohnzeile zeigen, sondern als Gesamtbetrag in die Produktpreise einrechnen (Backend
// foldet beim PDF). Intern bleibt die Position als Lohn erhalten (Nachkalkulation).
export interface LaborRow { description: string; quantity: string; unit_price: number | null; hidden?: boolean }

// `optional` (Workflow "optionale_positionen"): Eventualposition — erscheint mit Preis
// auf der Offerte, zählt aber NICHT ins Total (Backend rechnet sie raus).
export interface MaterialRow { art_nr: string; quantity: string; description?: string; unit_price?: number; unit?: string; optional?: boolean }

export interface ExtraProductRow {
  description: string
  quantity: string
  unit: string
  unit_price: string
  // Kalkulations-Metadaten — bei freier Erfassung von Hand, sonst aus der Lieferanten-PDF.
  // EK + Aufschlag % rechnen den unit_price (VK) automatisch; als editierbare Strings
  // gehalten (wie unit_price), damit Dezimaleingaben wie "10,50" nicht abgeschnitten werden.
  // Preisneutral fürs Total (dort zählt unit_price × quantity), aber für die Nachkalkulation.
  ek?: string
  margin_pct?: string
  supplier_id?: string | null
  category?: string | null
  positions?: ConfirmedPosition[]  // Stobag/Griesser: Auswahl-Breakdown der Produktzeile (Metadaten)
  optional?: boolean  // Eventualposition (Workflow "optionale_positionen"): nicht im Total
}

export interface ExtraChargeRow { description: string; total_price: string }
export interface InstallationRow { description: string; unit_price: string }

// Sonderpositionen (Demontage/Entsorgung): pauschal → unit_price = Fixbetrag;
// stunden → unit_price = Stundenansatz, hours = Stundenzahl.
export interface SpecialRow { description: string; mode: SpecialMode; unit_price: string; hours: string }

// ─── Zeilen im Bearbeiten-Formular ──────────────────────────

export type EditLaborRow = { description: string; quantity: string; unit_price: string; hidden?: boolean }
// `optional` (Workflow "optionale_positionen"): Eventualposition, nicht im Total.
export type EditFreeRow = { description: string; quantity: string; unit: string; unit_price: string; optional?: boolean }
// Produktzeilen aus PDF-Extraktion / manueller Erfassung führen zusätzlich EK, Aufschlag,
// Lieferant und den Positions-Breakdown mit. Preisneutral, aber sie müssen ein Edit überleben.
export type EditExtraRow = EditFreeRow & {
  ek?: string
  margin_pct?: string
  supplier_id?: string | null
  category?: string | null
  positions?: ConfirmedPosition[]
}
// `werkora_bonus` markiert die automatisch ergänzte Endziffern-Aufrundung
// (Feature `werkora_bonus`). Das Flag wird beim Bearbeiten unverändert
// zurückgeschickt, damit das Backend die Zeile beim Neurechnen wiedererkennt und
// aus der Basis nimmt — ginge es verloren, zählte der Aufschlag beim nächsten
// Speichern zur Basis und der Preis wanderte bei jeder Bearbeitung nach oben.
export type EditChargeRow = { description: string; total_price: string; werkora_bonus?: boolean }
export type EditTravelRow = { description: string; total_price: string }
