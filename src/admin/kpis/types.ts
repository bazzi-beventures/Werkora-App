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
  customer_id: string | null
  kunde_name: string | null
  projektleiter_id: string | null
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

  // Eigenkosten und Gewinn (Migration 20260827b/c). null = unbekannt, weil eine
  // Zutat fehlt — nie eine zu tief gerechnete Zahl.
  total_lohnkosten_intern: number | null
  /** Anzahl Lohnpositionen ohne hinterlegten Monatslohn. */
  lohn_intern_ohne_satz: number
  total_materialkosten_intern: number | null
  /** Anzahl Artikel ohne hinterlegten Einkaufspreis. */
  material_ohne_ek: number
  /**
   * Anzahl Materialzeilen ohne eingefrorenen EK — sie rechnen gegen den heutigen
   * Katalogpreis (Alt-Zeilen von vor Migration 20260827c). Keine Datenlücke,
   * aber eine Näherung, die spätere Preispflege rückwirkend verschiebt.
   */
  material_ek_geschaetzt: number
  total_kosten_intern: number | null

  offerte_nummer: string | null
  offerte_betrag: number
  offerte_status: string | null
  differenz_offerte_ist: number | null
  rechnung_id: number | null
  rechnung_nummer: string | null
  rechnung_betrag: number
  rechnung_status: string | null
  rechnung_bezahlt_am: string | null
  /** Summe aller gestellten Rechnungen (gesendet + bezahlt) des Projekts. */
  umsatz_gestellt: number
  /** Summe des tatsächlich eingegangenen Geldes. */
  umsatz_bezahlt: number
  gewinn_gestellt: number | null
  gewinn_bezahlt: number | null
  marge_gestellt_pct: number | null
  marge_bezahlt_pct: number | null

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
  /**
   * Stunden, die NICHT in die Zahlen dieser Zeile eingehen, weil sie auf einem
   * archivierten (Test-)Projekt oder einem internen Einsatz gebucht sind
   * (Migration 20260827b). Ausgewiesen statt stillschweigend weggelassen.
   */
  stunden_ohne_projektbezug: number
  // null = Position ohne Preis/Stundensatz vorhanden (Migration 20260815).
  // Die *_intern-Spalten und die Margen kamen mit 20260429, gingen beim
  // View-Neuaufbau 20260726/20260815 verloren und sind seit 20260827b zurück —
  // diesmal mit demselben NULL+Marker-Vertrag wie die Verrechnungsspalten.
  lohnkosten: number | null
  /** Anzahl Lohnpositionen ohne hinterlegten Stundensatz. */
  lohn_ohne_satz: number
  lohnkosten_intern: number | null
  /** Anzahl Mitarbeiter ohne hinterlegten Monatslohn. */
  mitarbeiter_ohne_lohn_count: number
  mitarbeiter_aktiv: number
  projekte_aktiv: number
  materialkosten: number | null
  /** Anzahl Materialpositionen ohne ermittelbaren VK. */
  material_ohne_preis: number
  materialkosten_intern: number | null
  /** Anzahl Artikel ohne hinterlegten Einkaufspreis. */
  material_ohne_ek_count: number
  /** Materialzeilen ohne eingefrorenen EK — gerechnet gegen den heutigen Katalog. */
  material_ek_geschaetzt: number
  total_kosten: number | null
  total_kosten_intern: number | null
  marge_arbeit: number | null
  marge_material: number | null
  rechnungen_erstellt: number
  rechnungen_betrag: number
  /** Umsatz gestellt: Rechnungen beim Kunden (gesendet + bezahlt), Anker `sent_at`. */
  umsatz_gestellt: number
  rechnungen_bezahlt_anzahl: number
  /** Umsatz bezahlt: eingegangenes Geld (`paid_amount`, sonst `total_amount`). */
  rechnungen_bezahlt_betrag: number
  /** Deckungsbeitrag auf der gestellten Basis — null, wenn Eigenkosten unbekannt. */
  gewinn_gestellt: number | null
  /** Deckungsbeitrag auf der bezahlten Basis — null, wenn Eigenkosten unbekannt. */
  gewinn_bezahlt: number | null
  marge_gestellt_pct: number | null
  marge_bezahlt_pct: number | null
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

/* ── Phase D: Kunde, Lieferant, Funktion (Migration 20260827d) ──
 *
 * Überall gilt dieselbe Regel wie in den übrigen KPI-Views: `null` heisst
 * „unbekannt, weil eine Zutat fehlt" — nie „null Franken". Die zugehörige
 * Marker-Spalte sagt, wie viele Zeilen es betrifft. */

export interface KpiKundeRow {
  tenant_id: string
  customer_id: string | null
  kunde_name: string
  /** true = Sammelzeile der Projekte ohne Kundenzuordnung (customer_id NULL). */
  ist_sammelzeile: boolean
  /** Archivierte Kunden werden geliefert, aber standardmässig nicht angezeigt. */
  ist_archiviert: boolean
  kunde_email: string | null
  kunde_telefon: string | null

  projekte_anzahl: number
  projekte_offen: number
  anzahl_rapporte: number
  total_arbeitsstunden: number

  umsatz_gestellt: number
  umsatz_bezahlt: number
  kosten_intern: number | null
  /** Anzahl Projekte ohne ermittelbare Eigenkosten — Grund für kosten_intern = null. */
  projekte_ohne_kosten: number
  gewinn_gestellt: number | null
  gewinn_bezahlt: number | null
  marge_gestellt_pct: number | null
  marge_bezahlt_pct: number | null

  /** Offert-ENTSCHEIDUNGEN, nicht Dokumente (offerten-varianten.md §9). */
  offerten_anzahl: number
  offerten_akzeptiert: number
  offerten_abgelehnt: number
  /** akzeptiert ÷ entschieden; null solange nichts entschieden ist. */
  annahmequote_pct: number | null

  rechnungen_anzahl: number
  rechnungen_offen: number
  zahlungserinnerungen_anzahl: number
  mahnungen_anzahl: number
  mahnquote_pct: number | null

  letzte_aktivitaet: string | null
}

export interface KpiLieferantRow {
  tenant_id: string
  supplier_id: string | null
  lieferant: string
  /** true = Sammelzeile für Artikel ohne hinterlegten Lieferanten. */
  ist_sammelzeile: boolean
  artikel_anzahl: number
  positionen: number
  menge: number
  verkaufsvolumen: number | null
  einkaufsvolumen: number | null
  positionen_ohne_vk: number
  positionen_ohne_ek: number
  /** EK aus dem heutigen Katalog statt aus dem Snapshot — Näherung, gezählt. */
  positionen_ek_geschaetzt: number
  marge_chf: number | null
  marge_pct: number | null
  letzte_verwendung: string | null
}

/** Geplante Marge auf bestellter Projektware (GET /pwa/kpi-lieferanten-projektware). */
export interface LieferantProjektwareRow {
  supplier_id: string | null
  lieferant: string
  ist_sammelzeile: boolean
  einkaufsvolumen: number
  verkaufsvolumen: number
  marge_chf: number
  marge_pct: number | null
  margenfaktor_schnitt: number | null
  positionen: number
  positionen_ohne_ek: number
  offerten_anzahl: number
}

export interface LieferantProjektwareSumme {
  einkaufsvolumen: number
  verkaufsvolumen: number
  marge_chf: number
  marge_pct: number | null
  margenfaktor_schnitt: number | null
  positionen: number
  positionen_ohne_ek: number
  offerten_anzahl: number
  lieferanten_anzahl: number
}

export interface LieferantProjektwareAntwort {
  rows: LieferantProjektwareRow[]
  summe: LieferantProjektwareSumme
}

/** Deckungsbeitrag je Funktion und Monat — bewusst ohne Personenbezug. */
export interface KpiFunktionMonatRow {
  tenant_id: string
  funktion: string
  jahr_monat: string // 'YYYY-MM'
  jahr: number
  monat: number
  stunden: number
  /** Wie viele Personen die Zeile tragen. Bei 1 ist sie faktisch diese Person. */
  anzahl_mitarbeiter: number
  anzahl_projekte: number
  verrechnet_chf: number | null
  stunden_ohne_satz: number
  lohnkosten_intern: number | null
  stunden_ohne_lohn: number
  deckungsbeitrag: number | null
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
