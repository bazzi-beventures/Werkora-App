// Entwurf der Bearbeiten-Maske einer bestehenden Offerte (Support WS-28).
//
// Bis 20261016 lebte, was in der Bearbeiten-Maske stand, nur im React-State. Wurde
// die Maske ohne «Abbrechen» abgebaut — Sitzung abgelaufen (App springt aufs
// Login), Tab vom Browser verworfen, Akku leer —, war alles weg. Jetzt hält die
// Maske ungespeicherte Änderungen laufend hier fest, ein Slot pro Offerte.
//
// Anders als beim Erstellen gibt es eine gespeicherte Fassung, gegen die der
// Entwurf entstand. Darum trägt er einen Fingerabdruck dieser Fassung (`base`):
// - stimmt er mit der Offerte beim nächsten Öffnen überein, wird der Entwurf
//   ohne Rückfrage übernommen («Entwurf zuerst», wie beim Erstellen);
// - weicht er ab, wurde die Offerte inzwischen gespeichert (oft von derselben
//   Person nach dem Neu-Login). Dann wird NICHT still überschrieben — die Maske
//   fragt, ob der ältere Stand übernommen werden soll.
//
// Gelöscht wird beim erfolgreichen Speichern, bei «Abbrechen»/«Zurück», beim
// Verwerfen im Dialog und sobald die Maske wieder dem gespeicherten Stand
// entspricht. Neuer Key → in storageMigrations.isKnownKey whitelisten.
//
// ⚠️ Key-Format und Shape sind Client-State: eine Änderung daran verlangt
// APP_DATA_VERSION + Migrationsschritt (siehe CLAUDE.md).

import type {
  EditChargeRow, EditExtraRow, EditFreeRow, EditLaborRow, EditTravelRow, InstallationRow, SpecialRow,
} from './quoteTypes'

const QUOTE_EDIT_DRAFT_PREFIX = 'quote-edit-draft:'

export function quoteEditDraftKey(quoteId: number): string {
  return QUOTE_EDIT_DRAFT_PREFIX + quoteId
}

/** Alles, was die Bearbeiten-Maske an Eingaben hält — dieselben Felder wie ihr
 *  Dirty-Vergleich. */
export interface QuoteEditDraftData {
  laborRows: EditLaborRow[]
  materialRows: EditFreeRow[]
  extraProducts: EditExtraRow[]
  extraCharges: EditChargeRow[]
  travelRows: EditTravelRow[]
  installationRows: InstallationRow[]
  specialRows: SpecialRow[]
  laborDiscount: string
  materialDiscount: string
  fixedPrice: string
  skontoActive: boolean
  skontoPct: string
  skontoDays: string
  notes: string
  productDescription: string
  customerId: string
  quoteType: 'offerte' | 'richtofferte'
}

export interface StoredQuoteEditDraft {
  savedAt: number
  /** Fingerabdruck der gespeicherten Offerte, gegen die der Entwurf entstand. */
  base: string
  data: QuoteEditDraftData
}

/** Kurzer, stabiler Fingerabdruck (FNV-1a, 32 bit). Kein Kryptozweck — er soll
 *  nur erkennen, ob sich die gespeicherte Offerte seit dem Entwurf geändert hat. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Defektes JSON oder fremde Shape wird ignoriert (selbstheilend). */
export function loadQuoteEditDraft(key: string): StoredQuoteEditDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data || typeof parsed.base !== 'string') return null
    return { data: parsed.data as QuoteEditDraftData, base: parsed.base, savedAt: parsed.savedAt ?? 0 }
  } catch {
    return null
  }
}

/** localStorage voll/blockiert wird geschluckt — der Entwurf ist Komfort, kein Muss. */
export function saveQuoteEditDraft(key: string, draft: StoredQuoteEditDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
  } catch { /* localStorage voll/blockiert */ }
}

export function removeQuoteEditDraft(key: string): void {
  try { localStorage.removeItem(key) } catch { /* egal */ }
}
