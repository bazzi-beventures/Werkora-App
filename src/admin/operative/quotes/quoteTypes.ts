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

// Sonderpositionen (Demontage/Entsorgung), drei Preismodelle:
//   pauschal → unit_price = Fixbetrag, keine Menge (1 × Betrag)
//   stunden  → unit_price = Stundenansatz, hours = Stundenzahl
//   stueck   → unit_price = Stückpreis,   hours = Stückzahl
//
// `hours` trägt bei 'stueck' also die Stückzahl. Bewusst dasselbe Feld statt eines
// zweiten: es ist dieselbe Mengenspalte an derselben Stelle der Maske, nur mit
// anderer Einheit — genauso wie `special_position_templates.default_hours` in der
// Datenbank (Migration 20260906_special_positions_stueck.sql). Ein zweites Feld wäre
// zudem eine Shape-Änderung am Offert-Entwurf im localStorage (APP_DATA_VERSION).
export interface SpecialRow { description: string; mode: SpecialMode; unit_price: string; hours: string }

// ─── Zeilen im Bearbeiten-Formular ──────────────────────────

export type EditLaborRow = { description: string; quantity: string; unit_price: string; hidden?: boolean }
// `optional` (Workflow "optionale_positionen"): Eventualposition, nicht im Total.
//
// `bonusBaseUnitPrice`/`bonusBaseTotalPrice`: der Preis dieser Zeile VOR der
// automatischen Endziffern-Aufrundung (Feature `werkora_bonus`). Der Aufschlag
// steckt seit der Umstellung in den Waren-Preisen statt in einer eigenen Zeile
// (docs/specs/werkora-bonus-produktpositionen.md) — ohne die Basis liesse er sich
// nicht mehr zurückrechnen. Die Felder werden beim Bearbeiten UNVERÄNDERT
// zurückgeschickt; gehen sie verloren, erkennt das Backend einen veralteten Client
// und rechnet den Bonus lieber gar nicht neu, statt einen zweiten obendrauf zu
// legen (§4.3). Preisneutral wie ek/margin_pct — die Maske rechnet nicht damit.
export type EditFreeRow = {
  description: string
  quantity: string
  unit: string
  unit_price: string
  optional?: boolean
  bonusBaseUnitPrice?: number
  bonusBaseTotalPrice?: number
}
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
