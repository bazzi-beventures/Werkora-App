// Zuordnung der audit_log-Aktionen zu Modulen und lesbaren Namen.
// Spec: docs/specs/nutzungs-dashboard.md §6.4.
//
// Warum hier und nicht in der View: jede neue Aktion wäre sonst eine Migration.
// Warum Regeln statt 111 Einzelzeilen für das Modul: Aktionen folgen dem Schema
// `admin_<verb>_<objekt>`, neue fallen damit automatisch richtig. Was durchfällt,
// landet sichtbar im Bucket „nicht zugeordnet" — die Aufforderung, eine Regel zu
// ergänzen, statt stillem Datenverlust.
//
// KNOWN_ACTIONS unten wird von tests/unit/test_usage_taxonomy.py gegen die
// tatsächlichen `_pwa_audit(...)`-Aufrufe in agents/ geprüft: eine neue Aktion
// ohne Eintrag macht die CI rot.

/** Modul-Schlüssel aus config.KNOWN_MODULES oder ein Sammeltopf-Pseudomodul. */
export type UsageModule = string

/**
 * Pseudomodule für das, was jeder Mandant hat und was deshalb in keinem
 * KNOWN_MODULES-Eintrag steht. Ohne sie landete die Hälfte der Aktionen unter
 * „nicht zugeordnet" und die Modul-Tabelle wäre unlesbar.
 */
export const PSEUDO_MODULES: Record<string, string> = {
  grundfunktion: 'Grundfunktionen',
  rapport: 'Rapporte',
  konfiguration: 'Konfiguration',
  // INSERT/UPDATE/DELETE/ANONYMIZE aus db/: der DSGVO-Audit-Trail auf
  // Arbeitszeiten, Rapporten und Materialverbrauch (20260320_add_audit_log.sql).
  // Gehört zu keinem Modul — es ist die Korrektur der Daten selbst.
  datenkorrektur: 'Datenkorrekturen',
}

export const UNMAPPED = 'nicht_zugeordnet'

// Reihenfolge = Priorität; die erste passende Regel gewinnt.
const RULES: { test: RegExp; module: UsageModule }[] = [
  // Der rohe DSGVO-Audit-Trail aus db/ (Grossbuchstaben, kein Präfix).
  { test: /^(INSERT|UPDATE|DELETE|ANONYMIZE)$/,  module: 'datenkorrektur' },
  // Rapport-Aktionen der Monteur-Seite. Muss VOR der Material-Regel stehen —
  // sonst schnappt sich /material/ das `report_kleinmaterial_recorded` und der
  // Rapport landet unter Lager.
  // `aggregate_report` fuer den Sammelrapport (Teilrapporte buendeln/aufloesen) —
  // die Aktionen heissen `create_/dissolve_aggregate_report` und traegen weder das
  // Praefix `report_` noch das Wort "rapport".
  { test: /^(report_|log_report)|rapport|aggregate_report/, module: 'rapport' },
  // Mandanten-Einstellungen und Superadmin-Werkzeuge. Vor /schedul/, sonst
  // zählt `admin_update_tenant_scheduling` als Einsatzplanung.
  { test: /tenant_|superadmin_push|support_ticket|newsletter/, module: 'konfiguration' },
  { test: /aftersales/,                          module: 'aftersales' },
  // Offerten-Umfeld: 'variant' (Offerten-Variante), 'special_position' und
  // 'installation_template' tragen das Wort "quote" nicht im Namen.
  { test: /quote|variant|special_position|installation_template/, module: 'quotes' },
  { test: /camt|reconcile/,                      module: 'payment_matching' },
  { test: /invoice|mahnung|zahlungserinnerung/,  module: 'invoicing' },
  { test: /absence|vacation/,                    module: 'hr' },
  { test: /correction|clock_in|clock_out|timesheet|zeit_/, module: 'timekeeping' },
  // Aufgaben-Vorlagen vor /project/, sonst zählen sie als Grundfunktion.
  { test: /task_template|board_task/,            module: 'task_board' },
  // /schedul/ vor /project/: `admin_update_project_schedule` ist Einsatzplanung.
  { test: /schedul|appointment/,                 module: 'scheduling' },
  { test: /document_backup/,                     module: 'document_backup' },
  { test: /material|stock|unit|pricing_rule|supplier|frequent/, module: 'inventory' },
  { test: /project|customer|staff|user|pin/,     module: 'grundfunktion' },
]

/**
 * Module, für die es überhaupt eine Regel gibt. Nur sie können je eine Zahl
 * > 0 tragen — für alle anderen ist "0 Aktionen" keine Messung, sondern das
 * Fehlen einer Messung.
 *
 * Aus RULES abgeleitet statt von Hand gepflegt: eine neue Regel macht ihr Modul
 * automatisch messbar. Eine zweite Liste hier würde beim ersten Nachtrag
 * auseinanderlaufen, und zwar still.
 */
const RULE_MODULES: ReadonlySet<string> = new Set(RULES.map(r => r.module))

/** Wie weit `audit_log` ein Modul überhaupt abdeckt. */
export type Coverage = 'voll' | 'teilweise' | 'keine'

/**
 * Module mit Regel, deren Regel aber nur einen Randbereich trägt: die Zahl
 * stimmt, sie beantwortet nur eine engere Frage als der Modulname verspricht.
 *
 * `timekeeping` ist der Fall, der beim ersten Blick aufs Dashboard in die Irre
 * führte: 23 Aktionen neben 4'000 lesen sich als "Zeiterfassung läuft nicht",
 * dabei schreibt das Ein- und Ausstempeln überhaupt nichts ins `audit_log`
 * (`agents/routers/timekeeping.py` auditiert nur `zeit_recorded_at_verworfen`
 * und `create_absence`). Gezählt werden ausschliesslich Admin-Eingriffe.
 */
const PARTIAL_COVERAGE: Record<string, string> = {
  timekeeping:
    'Ein- und Ausstempeln wird nicht protokolliert. Gezählt werden nur '
    + 'Admin-Eingriffe: Korrekturen freigeben oder ablehnen, Sammel-Einstempeln, '
    + 'Stundenexport, verworfene Zeitstempel.',
}

/**
 * Abdeckung eines Moduls. `keine` heisst: keine Regel zeigt auf dieses Modul,
 * es kann also nie Aktionen bekommen — Push-, Erinnerungs- und
 * Hintergrundmodule, dazu `ai`, `help_bot` und `kpis`. Deren Wirkung steht
 * woanders (LLM-Kosten, Error-Logs), nur eben nicht im Audit-Trail.
 */
export function moduleCoverage(module: string): Coverage {
  if (module in PARTIAL_COVERAGE) return 'teilweise'
  return RULE_MODULES.has(module) || module === UNMAPPED ? 'voll' : 'keine'
}

/** Erläuterung zu einer Teilabdeckung; undefined, wenn es nichts zu erklären gibt. */
export function coverageNote(module: string): string | undefined {
  return PARTIAL_COVERAGE[module]
}

/** Modul einer Aktion; UNMAPPED, wenn keine Regel greift. */
export function moduleOfAction(action: string): UsageModule {
  for (const r of RULES) if (r.test.test(action)) return r.module
  return UNMAPPED
}

// Lesbare Namen. Unbekannte Aktionen fallen auf eine mechanische Aufbereitung
// zurück (siehe actionLabel), erscheinen also nie als leere Zelle.
const ACTION_LABELS: Record<string, string> = {
  // ── Offerten ──
  admin_send_quote: 'Offerte versendet',
  admin_regenerate_quote: 'Offerte neu erzeugt',
  admin_update_quote: 'Offerte geändert',
  admin_quote_status: 'Offerten-Status gesetzt',
  admin_add_variant: 'Offerten-Variante angelegt',
  admin_send_quote_reminder: 'Offerte: Erinnerung versendet',
  admin_send_quote_thankyou: 'Offerte: Dankesmail versendet',
  admin_send_quote_rejection: 'Offerte: Absage versendet',
  admin_send_quote_order_confirmation: 'Auftragsbestätigung versendet',
  admin_update_quote_skonto_defaults: 'Skonto-Vorgaben geändert',
  admin_create_quote_attachment_template: 'Offerten-Anhang angelegt',
  admin_delete_quote_attachment_template: 'Offerten-Anhang gelöscht',
  admin_create_special_position_template: 'Sonderposition angelegt',
  admin_update_special_position_template: 'Sonderposition geändert',
  admin_delete_special_position_template: 'Sonderposition gelöscht',
  admin_create_installation_template: 'Montage-Vorlage angelegt',
  admin_update_installation_template: 'Montage-Vorlage geändert',
  admin_delete_installation_template: 'Montage-Vorlage gelöscht',

  // ── Rechnungen ──
  admin_generate_invoice: 'Rechnung erzeugt',
  admin_send_invoice: 'Rechnung versendet',
  admin_mark_invoice_sent: 'Rechnung als versendet markiert',
  admin_mark_invoice_paid: 'Rechnung als bezahlt markiert',
  admin_unmark_invoice_paid: 'Zahlung zurückgenommen',
  admin_archive_invoice: 'Rechnung archiviert',
  admin_send_mahnung: 'Mahnung versendet',
  admin_send_zahlungserinnerung: 'Zahlungserinnerung versendet',

  // ── Nachbetreuung ──
  admin_send_aftersales: 'Nachbetreuung versendet',
  admin_update_aftersales: 'Nachbetreuung geändert',
  admin_cancel_aftersales: 'Nachbetreuung storniert',
  admin_reactivate_aftersales: 'Nachbetreuung reaktiviert',
  admin_regenerate_aftersales: 'Nachbetreuung neu erzeugt',

  // ── Zeit & Personal ──
  admin_approve_correction: 'Korrektur freigegeben',
  admin_reject_correction: 'Korrektur abgelehnt',
  admin_bulk_clock_in: 'Sammel-Einstempelung',
  admin_export_timesheets: 'Stundenrapport exportiert',
  admin_approve_absence: 'Absenz freigegeben',
  admin_reject_absence: 'Absenz abgelehnt',

  // ── Einsatzplanung ──
  admin_create_appointment: 'Termin angelegt',
  admin_update_appointment: 'Termin geändert',
  admin_delete_appointment: 'Termin gelöscht',

  // ── Material & Lager ──
  admin_create_material: 'Artikel angelegt',
  admin_update_material: 'Artikel geändert',
  admin_deactivate_material: 'Artikel deaktiviert',
  admin_material_image: 'Artikelbild hochgeladen',
  admin_material_image_delete: 'Artikelbild gelöscht',
  admin_stock_adjust: 'Lagerbestand korrigiert',
  admin_add_frequent_material: 'Häufiger Artikel hinzugefügt',
  admin_remove_frequent_material: 'Häufiger Artikel entfernt',
  admin_create_unit: 'Einheit angelegt',
  admin_delete_unit: 'Einheit gelöscht',
  admin_create_supplier: 'Lieferant angelegt',
  admin_update_supplier: 'Lieferant geändert',
  admin_delete_supplier: 'Lieferant gelöscht',
  admin_upsert_pricing_rule: 'Preisregel gespeichert',
  admin_update_pricing_rule: 'Preisregel geändert',
  admin_delete_pricing_rule: 'Preisregel gelöscht',

  // ── Projekte & Kunden ──
  admin_create_project: 'Projekt angelegt',
  admin_update_project: 'Projekt geändert',
  admin_set_project_status: 'Projekt-Status gesetzt',
  admin_close_project: 'Projekt geschlossen',
  admin_reopen_project: 'Projekt wiedereröffnet',
  admin_create_project_approval: 'Visierung angefordert',
  admin_approve_project_approval: 'Visierung erteilt',
  admin_reject_project_approval: 'Visierung abgelehnt',
  admin_create_customer: 'Kunde angelegt',
  admin_update_customer: 'Kunde geändert',
  admin_delete_customer: 'Kunde gelöscht',

  // ── Benutzer & Stammdaten ──
  admin_create_staff: 'Mitarbeiter angelegt',
  admin_update_staff: 'Mitarbeiter geändert',
  admin_anonymize_staff: 'Mitarbeiter anonymisiert',
  admin_upsert_staff_role: 'Funktion gespeichert',
  admin_delete_staff_role: 'Funktion gelöscht',
  admin_reorder_staff_roles: 'Funktionen sortiert',
  admin_create_user: 'Benutzer angelegt',
  admin_update_user: 'Benutzer geändert',
  admin_anonymize_user: 'Benutzer anonymisiert',
  admin_set_user_password: 'Passwort gesetzt',
  admin_generate_pin: 'PIN erzeugt',

  // ── Rapporte ──
  log_report: 'Rapport erfasst',
  create_aggregate_report: 'Gesamtrapport erstellt',
  dissolve_aggregate_report: 'Gesamtrapport aufgelöst',
  accept_aggregate_report: 'Gesamtrapport ohne Unterschrift abgeschlossen',
  report_set_partial: 'Rapport in die Teilrapport-Serie aufgenommen',
  report_unset_partial: 'Rapport aus der Teilrapport-Serie gelöst',
  report_kleinmaterial_recorded: 'Kleinmaterial erfasst',
  report_ersatzteile_recorded: 'Ersatzteile erfasst',
  admin_paper_rapport_pdf: 'Papier-Rapport erzeugt',

  // ── Offerten (Fortsetzung) ──
  admin_create_quote: 'Offerte angelegt',
  admin_extract_quote_pdf: 'Offerte aus PDF gelesen',

  // ── Zahlungsabgleich ──
  admin_reconcile_camt: 'camt-Datei abgeglichen',

  // ── Projektentwürfe & Aufgaben ──
  user_create_project_draft: 'Projektentwurf erfasst',
  admin_convert_project_draft: 'Projektentwurf übernommen',
  admin_reject_project_draft: 'Projektentwurf abgelehnt',
  admin_set_project_beschaffung: 'Beschaffungsstatus gesetzt',
  admin_create_project_task_template: 'Aufgaben-Vorlage angelegt',
  admin_update_project_task_template: 'Aufgaben-Vorlage geändert',
  admin_delete_project_task_template: 'Aufgaben-Vorlage gelöscht',

  // ── Einsatzplanung (Fortsetzung) ──
  admin_update_project_schedule: 'Einsatzplan geändert',
  admin_export_schedule_pdf: 'Einsatzplan exportiert',

  // ── Zeit (Fortsetzung) ──
  create_absence: 'Absenz erfasst',
  zeit_recorded_at_verworfen: 'Zeitstempel verworfen',

  // ── Material (Fortsetzung) ──
  admin_import_materials: 'Artikel importiert',
  admin_material_cleanup_bulk: 'Artikel-Bereinigung (Sammel)',
  admin_material_vk_bulk_increase: 'VK-Massenänderung',
  admin_rename_unit: 'Einheit umbenannt',

  // ── Datensicherung ──
  admin_document_backup_start: 'Datensicherung gestartet',
  admin_document_backup_cancel: 'Datensicherung abgebrochen',

  // ── Konfiguration & Admin-Tools ──
  admin_update_tenant_modules: 'Module geändert',
  admin_update_tenant_feature: 'Feature-Flag geändert',
  admin_update_tenant_scheduling: 'Einsatzplan-Konfiguration geändert',
  admin_update_tenant_travel_cost: 'Wegkosten-Tabelle geändert',
  superadmin_push_send: 'Test-Push versendet',
  support_ticket_update: 'Support-Meldung bearbeitet',
  newsletter_send: 'Newsletter versendet',

  // ── Roher DSGVO-Audit-Trail aus db/ ──
  INSERT: 'Datensatz angelegt (Audit)',
  UPDATE: 'Datensatz geändert (Audit)',
  DELETE: 'Datensatz gelöscht (Audit)',
  ANONYMIZE: 'Datensatz anonymisiert (Audit)',
}

/**
 * Alle Aktionen, die der Code heute schreibt. Wird von
 * tests/unit/test_usage_taxonomy.py gegen agents/ geprüft — eine neue Aktion
 * ohne Eintrag hier macht die CI rot. Reihenfolge: alphabetisch.
 */
export const KNOWN_ACTIONS: readonly string[] = Object.keys(ACTION_LABELS).sort()

/**
 * Lesbarer Name. Unbekanntes wird mechanisch aufbereitet
 * (`admin_foo_bar` → `Foo bar`), damit eine neue Aktion nie als leere oder
 * rohe Zelle erscheint.
 */
export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action]
  if (known) return known
  const words = action.replace(/^admin_/, '').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** True für die Sammeltöpfe: die kann ein Mandant nicht ein- oder ausschalten. */
export function isPseudoModule(module: string): boolean {
  return module === UNMAPPED || module in PSEUDO_MODULES
}

/** Anzeigename eines Moduls: Pseudomodul-Text, sonst der Rohschlüssel. */
export function moduleLabel(module: string): string {
  if (module === UNMAPPED) return 'nicht zugeordnet'
  return PSEUDO_MODULES[module] ?? module
}
