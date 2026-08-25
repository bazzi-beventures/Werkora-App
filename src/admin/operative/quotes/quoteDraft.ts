// Auto-Entwurf des Offert-Erstellformulars (Charge H2 — aus QuotesScreen gezogen).
//
// Der noch nicht abgeschickte Offert-Entwurf wird laufend in localStorage gehalten
// (pro Projekt ein Slot), damit ein versehentliches Schliessen des Fensters die
// Eingaben nicht verliert.
//
// Bewusst „Entwurf zuerst": beim Öffnen wird ein vorhandener Entwurf ohne Rückfrage
// in das (noch leere) Formular übernommen — die Entscheidung fällt erst beim
// Verlassen («Entwurf behalten» / «verwerfen»). Andersherum (beim Öffnen fragen,
// beim Verlassen still wegwerfen) verliert, wer die Frage falsch wegklickt, seine
// Eingaben — genau das soll nicht passieren.
//
// Gelöscht wird beim erfolgreichen Erstellen, per «Verwerfen» und beim Verlassen
// eines leeren Formulars. Neuer Key → in storageMigrations.isKnownKey whitelisten.
//
// ⚠️ Key-Format und Shape sind Client-State: eine Änderung daran verlangt
// APP_DATA_VERSION + Migrationsschritt (siehe CLAUDE.md). Das Verschieben dieses
// Codes aus dem QuotesScreen hierher hat beides nicht angefasst.

import type {
  ExtraChargeRow, ExtraProductRow, InstallationRow, LaborRow, MaterialRow, SpecialRow,
} from './quoteTypes'

// Standard-Bemerkungen, die beim Erstellen einer Offerte vorausgefüllt werden.
// Der verbindliche Text wird pro Mandant unter "Offert-Vorlagen" gepflegt und beim
// Laden des Formulars von /pwa/admin/quote-standard-notes geholt. Diese Konstante
// dient nur noch als Fallback, falls der Abruf fehlschlägt. Echte Zeilenumbrüche (\n) —
// das PDF rendert sie via nl2br als <br>.
export const STANDARD_NOTES = `Preise inkl. Montage und Transport.
Lieferfrist nach Absprache, nach def. Massaufnahme.

Diese Offerte basiert auf vorläufigen Richtmassen und steht unter dem Vorbehalt der abschliessenden Massaufnahme vor Ort. Allfällige Abweichungen können zu Anpassungen in Preis und Ausführung führen.

Diese Offerte ist ab Ausstellungsdatum während 2 Monaten gültig.
Nach Ablauf dieser Frist behalten wir uns vor, Preise und Konditionen neu zu prüfen und anzupassen.`

const QUOTE_DRAFT_PREFIX = 'quote-draft:'

/** localStorage-Slot eines Projekts. Ein Projekt = ein Entwurf. */
export function quoteDraftKey(projectName: string): string {
  return QUOTE_DRAFT_PREFIX + projectName
}

export interface QuoteDraft {
  projectName: string
  laborRows: LaborRow[]
  materialRows: MaterialRow[]
  extraProducts: ExtraProductRow[]
  extraCharges: ExtraChargeRow[]
  includeTravelCost: boolean
  installationRows: InstallationRow[]
  specialRows: SpecialRow[]
  laborDiscount: string
  materialDiscount: string
  fixedPrice: string
  // Optional: Entwürfe aus der Zeit vor dem Skonto-Häkchen kennen das Feld nicht —
  // applyDraft leitet es dann aus skontoPct ab (siehe dort).
  skontoActive?: boolean
  skontoPct: string
  skontoDays: string
  notes: string
  productDescription: string
  useStandardNotes: boolean
}

// Skonto-Vorgabe des Mandanten (Offert-Vorlagen), mit der das Formular startet.
// Leere Strings = keine Vorgabe.
export interface SkontoDefaults { pct: string; days: string }
export const NO_SKONTO_DEFAULTS: SkontoDefaults = { pct: '', days: '' }

/** Gibt es für dieses Projekt einen laufenden (noch nicht abgeschickten) Entwurf?
 *  Genutzt vom Projekt-Offerten-Tab, um den «Entwurf fortsetzen»-Button zu zeigen. */
export function hasQuoteDraft(projectName: string): boolean {
  try { return !!localStorage.getItem(quoteDraftKey(projectName)) } catch { return false }
}

/** Gespeicherten Entwurf lesen. Defektes JSON wird ignoriert (selbstheilend);
 *  `savedAt` ist der Zeitstempel für den Hinweis „Entwurf vom …". */
export function loadQuoteDraft(key: string): { data: QuoteDraft; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return { data: parsed.data as QuoteDraft, savedAt: parsed.savedAt ?? 0 }
  } catch {
    return null  // defektes JSON: Entwurf ignorieren
  }
}

/** Entwurf schreiben. localStorage voll/blockiert wird geschluckt — der Entwurf
 *  ist Komfort, kein Muss. */
export function saveQuoteDraft(key: string, data: QuoteDraft, savedAt: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt, data }))
  } catch { /* localStorage voll/blockiert — Entwurf ist Komfort, kein Muss */ }
}

export function removeQuoteDraft(key: string): void {
  try { localStorage.removeItem(key) } catch { /* egal */ }
}

/**
 * Hat der Entwurf überhaupt nennenswerten Inhalt? Leere Default-Formulare
 * (eine leere Lohn-/Materialzeile, Standard-Bemerkungen, die Skonto-Vorgabe des
 * Mandanten) zählen NICHT — so wird kein leerer Entwurf gespeichert und das
 * Restore-Banner bleibt aus.
 */
export function quoteDraftHasContent(
  d: QuoteDraft,
  stdNotes: string,
  skontoDefaults: SkontoDefaults = NO_SKONTO_DEFAULTS,
): boolean {
  return (
    d.laborRows.some(r => r.description.trim() || r.quantity.trim()) ||
    d.materialRows.some(r => r.art_nr.trim() || r.quantity.trim()) ||
    d.extraProducts.length > 0 ||
    d.extraCharges.length > 0 ||
    d.installationRows.length > 0 ||
    d.specialRows.length > 0 ||
    !!d.productDescription.trim() ||
    !!d.laborDiscount.trim() ||
    !!d.materialDiscount.trim() ||
    !!d.fixedPrice?.trim() ||
    // Nur eine Abweichung von der Vorgabe zählt: sonst wäre jedes frisch geöffnete
    // Formular mit Skonto-Vorgabe sofort ein "Entwurf" (Restore-Banner, obwohl
    // niemand etwas eingegeben hat).
    (d.skontoPct ?? '').trim() !== skontoDefaults.pct ||
    (d.skontoDays ?? '').trim() !== skontoDefaults.days ||
    // Das Häkchen startet immer abgewählt (auch mit Mandanten-Vorgabe) — Anhaken ist
    // also eine Eingabe und muss den Entwurf auslösen, selbst wenn Satz und Frist noch
    // exakt auf der Vorgabe stehen. Der Fallback deckt Altentwürfe ohne das Feld ab:
    // dort hiess ein gefüllter %-Satz "Skonto an".
    (d.skontoActive ?? !!(d.skontoPct ?? '').trim()) ||
    (d.notes.trim() !== '' && d.notes !== STANDARD_NOTES && d.notes !== stdNotes)
  )
}
