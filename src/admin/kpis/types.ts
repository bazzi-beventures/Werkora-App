import type React from 'react'

/* ── TypeScript-Interfaces für Supabase KPI-Views ─────────── */

export interface KpiDashboardRow {
  tenant_id: string
  mitarbeiter_aktiv: number
  abwesende_heute: number
  projekte_aktiv: number
  projekte_abgeschlossen: number
  stunden_aktueller_monat: number
  stunden_vormonat: number
  stunden_veraenderung_pct: number
  // null = mindestens eine Position ohne Preis/Stundensatz, die Summe waere
  // unvollstaendig (Migration 20260815). Die Tabellen rendern das als „—".
  lohnkosten_aktueller_monat: number | null
  materialkosten_aktueller_monat: number | null
  kosten_aktueller_monat: number | null
  /** Anzahl Lohnpositionen ohne hinterlegten Stundensatz. */
  lohn_ohne_satz: number
  /** Anzahl Materialpositionen ohne ermittelbaren VK. */
  material_ohne_preis: number
  umsatz_aktueller_monat: number
  offene_rechnungen_anzahl: number
  offene_rechnungen_betrag: number
  offene_offerten_anzahl: number
  lager_kritisch_anzahl: number
  ueberstunden_gesamt_stunden: number
}

export interface KpiProjektRow {
  tenant_id: string
  projekt_id: string
  projekt_nummer: string | null
  projekt_name: string
  kunde_name: string | null
  distanz_km: number | null
  ist_abgeschlossen: boolean
  anzahl_rapporte: number
  erster_rapport: string | null
  letzter_rapport: string | null
  total_arbeitsstunden: number
  // null = Position ohne Preis/Stundensatz vorhanden (Migration 20260815).
  total_lohnkosten: number | null
  anzahl_mitarbeiter: number
  mitarbeiter_liste: string | null
  total_materialkosten: number | null
  anzahl_artikel: number
  total_kosten: number | null
  /** Anzahl Lohnpositionen ohne hinterlegten Stundensatz. */
  lohn_ohne_satz: number
  /** Anzahl Materialpositionen ohne ermittelbaren VK. */
  material_ohne_preis: number
  offerte_nummer: string | null
  offerte_betrag: number
  offerte_status: string | null
  differenz_offerte_ist: number | null
  rechnung_id: number | null
  rechnung_nummer: string | null
  rechnung_betrag: number
  rechnung_status: string | null
  rechnung_bezahlt_am: string | null
  erster_einsatz: string | null
  letzter_einsatz: string | null
  projektdauer_tage: number
}

export interface KpiFinanzenMonatRow {
  tenant_id: string
  jahr: number
  monat: number
  jahr_monat: string
  monat_name: string
  anzahl_rapporte: number
  arbeitsstunden: number
  // null = Position ohne Preis/Stundensatz vorhanden (Migration 20260815).
  lohnkosten: number | null
  /** Anzahl Lohnpositionen ohne hinterlegten Stundensatz. */
  lohn_ohne_satz: number
  // ACHTUNG: die *_intern-Spalten und die Margen kamen mit Migration 20260429,
  // wurden aber von 20260726 beim Neuaufbau der View nicht mitgenommen — sie
  // fehlen in vw_kpi_finanzen_monat und kommen als undefined an (Anzeige „—").
  // Siehe docs/specs/refactoring-charge-d-notizen.md.
  lohnkosten_intern: number
  mitarbeiter_ohne_lohn_count: number
  mitarbeiter_aktiv: number
  projekte_aktiv: number
  materialkosten: number | null
  /** Anzahl Materialpositionen ohne ermittelbaren VK. */
  material_ohne_preis: number
  materialkosten_intern: number
  material_ohne_ek_count: number
  total_kosten: number | null
  total_kosten_intern: number
  marge_arbeit: number
  marge_material: number
  rechnungen_erstellt: number
  rechnungen_betrag: number
  rechnungen_bezahlt_anzahl: number
  rechnungen_bezahlt_betrag: number
  debitorenlaufzeit_tage: number
  offerten_erstellt: number
  offerten_betrag: number
  offerten_akzeptiert: number
  offerten_abgelehnt: number
}

export interface KpiMitarbeiterRow {
  tenant_id: string
  staff_id: string
  mitarbeiter_name: string
  kuerzel: string
  funktion: string | null
  stundensatz: number | null
  total_rapportstunden: number
  anzahl_projekte: number
  total_stempelstunden: number
  total_pausenstunden: number
  anzahl_arbeitstage: number
  differenz_stempel_rapport: number
  durchschnitt_stunden_pro_tag: number
  ueberstunden_saldo_minuten: number
  ueberstunden_saldo_stunden: number
  ferientage_verbraucht: number
  krankheitstage: number
  erster_einsatz: string | null
  letzter_arbeitstag: string | null
  letzter_rapport: string | null
}

export interface KpiMaterialRow {
  tenant_id: string
  material_id: string
  art_nr: string
  artikelname: string
  kategorie: string | null
  einheit: string | null
  einzelpreis: number
  einkaufspreis: number | null
  ist_aktiv: boolean
  lagerbestand: number
  mindestbestand: number
  lager_kritisch: boolean
  lagerwert: number
  total_verbrauch: number
  total_verbrauchskosten: number
  anzahl_projekte: number
  verbrauch_30_tage: number
  verbrauch_90_tage: number
  reichweite_tage: number | null
  erster_verbrauch: string | null
  letzter_verbrauch: string | null
}

export interface KpiWartungRow {
  tenant_id: string
  project_id: string
  project_name: string
  customer_name: string | null
  wartung_interval_months: number | null
  wartung_last_at: string | null
  wartung_next_due_at: string | null
  days_remaining: number | null
  status: 'kein_plan' | 'ueberfaellig' | 'faellig' | 'anstehend' | 'ok'
}

export interface KpiLeistungsartMonatRow {
  tenant_id: string
  monat: string
  art_der_arbeit: string | null
  total_stunden: number
  anzahl_sessions: number
  anzahl_mitarbeiter: number
}

export interface KpiMaterialLeistungsartRow {
  tenant_id: string
  art_der_arbeit: string
  anzahl_artikel: number
  anzahl_buchungen: number
  total_materialkosten: number
  total_materialkosten_intern: number
}

/* ── LLM-Kosten-Views (eine Zeile pro Tag × Dimension) ── */

interface KpiLlmKostenBase {
  tenant_id: string
  datum: string // 'YYYY-MM-DD' (Europe/Zurich)
  calls: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  kosten_usd: number
}

export interface KpiLlmKostenEndpunktRow extends KpiLlmKostenBase {
  endpoint: string
}

export interface KpiLlmKostenModellRow extends KpiLlmKostenBase {
  provider: string
  model: string
}

export interface KpiLlmKostenBenutzerRow extends KpiLlmKostenBase {
  user_id: string
  benutzer_name: string
}

// ── Nutzungs-Dashboard (Spec docs/specs/nutzungs-dashboard.md) ──

export interface KpiNutzungAktionRow {
  tenant_id: string
  datum: string // 'YYYY-MM-DD' (Europe/Zurich)
  action: string
  entity: string
  platform: string
  aktionen: number
  /** ANZAHL beteiligter Benutzer an diesem Tag, keine Namen — Spec §5. */
  benutzer: number
}

export interface KpiNutzungAdoptionRow {
  tenant_id: string
  user_id: string
  benutzer_name: string
  rolle: string | null
  is_active: boolean | null
  konto_erstellt: string | null
  /** null = nie eingeloggt (keine pwa_sessions-Zeile). */
  zuletzt_gesehen: string | null
}

export interface CategoryPricingRow {
  id: string
  tenant_id: string
  category: string
  margin_factor: number
  notes: string | null
}

export interface InstallationTemplateRow {
  id: string
  label: string
  default_fee: number
  notes: string | null
}

export interface SupplierPricingRow {
  id: string
  tenant_id: string
  supplier_id: string
  category: string | null
  markup_pct: number
}

/* ── Generische Hilfstypen ───────────────────────────── */

export interface ColumnDef<T> {
  key: keyof T & string
  label: string
  align?: 'left' | 'right'
  format?: (value: unknown, row: T) => string
  render?: (value: unknown, row: T) => React.ReactNode
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

export interface FilterGroup {
  key: string
  label: string
  options: { value: string; count: number }[]
}

/* ── Projekt-Pipeline (GET /pwa/kpi-projekt-pipeline) ─── */

// Ein Eintrag = eine ENTSCHEIDUNG, nicht ein Dokument: eine Variantengruppe
// (Option A/B/C zur Kundenauswahl) liefert einen Eintrag mit dem Betrag der
// Leit- bzw. angenommenen Variante. Das Backend reduziert das bereits fertig
// (db/kpis.py build_projekt_pipeline_rows, Spec offerten-varianten.md §9).
export interface PipelineOfferte {
  status: string // entwurf | gesendet | akzeptiert | abgelehnt
  betrag: number // brutto (backend-normalisiert via quote_gross_total)
  datum: string | null // created_at, YYYY-MM-DD
  /** Zahl der vertretenen Offerten: >1 nur bei einer Variantengruppe. Ältere
   *  Backends liefern das Feld nicht — Anzeige behandelt undefined wie 1. */
  variant_count?: number
}

export interface PipelineRechnung {
  status: string // ausstehend | gesendet | bezahlt (archiviert/inaktiv gefiltert)
  betrag: number
  gesendet_am: string | null
  bezahlt_am: string | null
  bezahlt_betrag: number // paid_amount, Fallback betrag; 0 solange unbezahlt
}

export interface PipelineProjektRow {
  project_id: string | null
  projekt_nummer: string | null
  projekt_name: string
  projekt_status: string
  is_closed: boolean
  kunde_name: string | null
  customer_id: string | null
  projektleiter_id: string | null
  projektleiter_name: string | null
  offerten: PipelineOfferte[]
  rapporte: (string | null)[] // report_date je Rapport
  rechnungen: PipelineRechnung[] // max. 1 Eintrag: nur die aktuellste Rechnung des Projekts
}
